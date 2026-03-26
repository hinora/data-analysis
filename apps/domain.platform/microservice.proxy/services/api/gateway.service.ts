import type { IncomingMessage, ServerResponse } from "node:http";
import type { Readable } from "node:stream";
import Busboy from "@fastify/busboy";
import type {
  Context,
  LoggerInstance,
  ServiceBroker,
  ServiceSchema,
} from "moleculer";
import ApiGateway from "moleculer-web";

/** Gateway request with optional connection info */
interface GatewayRequest extends IncomingMessage {
  $params?: Record<string, string>;
  connection?: { remoteAddress?: string; socket?: { remoteAddress?: string } };
}

/** Extended context meta for gateway requests */
interface GatewayMeta {
  clientIP?: string;
  token?: string;
  userAgent?: string;
}

/** Service instance type for lifecycle methods */
interface GatewayServiceThis {
  broker: ServiceBroker;
  logger: LoggerInstance;
  settings: { ip: string; port: number };
}

const ApiGatewayService: ServiceSchema = {
  name: "proxy",

  mixins: [ApiGateway],

  settings: {
    // Exposed port
    port: process.env.PORT ? Number(process.env.PORT) : 3000,

    // Exposed IP
    ip: process.env.HOST || "0.0.0.0",

    // Global CORS settings
    cors: {
      origin: process.env.CORS_ORIGIN || "*",
      methods: ["GET", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"],
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-Requested-With",
        "Accept",
      ],
      exposedHeaders: [],
      credentials: false,
      maxAge: 3600,
    },

    // Rate limiter
    rateLimit: {
      // How long to keep record of requests in memory (in ms)
      window: 60 * 1000, // 1 minute

      // Max number of requests during window
      limit: process.env.RATE_LIMIT ? Number(process.env.RATE_LIMIT) : 100,

      // Set rate limit headers to response
      headers: true,

      // Function to generate key
      key: (req: GatewayRequest) => {
        return (
          req.headers["x-forwarded-for"] ||
          req.connection?.remoteAddress ||
          req.socket?.remoteAddress ||
          req.connection?.socket?.remoteAddress
        );
      },
    },

    // Logging
    logRequestParams: "info",
    logResponseData: null,

    routes: [
      {
        // API v1 route
        path: "/api",

        // Enable whitelist - allow all services by default
        // You can restrict this to specific services/actions
        whitelist: [
          // Allow all actions from all services
          "**",

          // Examples of specific whitelisting:
          // "auth.*",           // All auth service actions
          // "book.*",           // All book service actions
          // "category.*",       // All category service actions
          // "users.list",       // Only users.list action
          // /^math\.\w+$/,      // Regex pattern
        ],

        // Route-level CORS settings (inherits from global if not set)
        cors: true,

        // Mapping policy
        // - "all": enable to request all routes with or without aliases
        // - "restrict": enable to request only the routes with aliases
        mappingPolicy: "all",

        // Enable/disable parameter merging
        mergeParams: true,

        // Enable authentication
        // Set to true to enable the `authenticate` method
        authentication: false,

        // Enable authorization
        // Set to true to enable the `authorize` method
        authorization: false,

        // Auto-aliases: automatically generate REST routes from service action definitions
        autoAliases: true,

        // Parse request body
        bodyParsers: {
          json: {
            strict: false,
            limit: "1MB",
          },
          urlencoded: {
            extended: true,
            limit: "1MB",
          },
        },

        // Route-level busboy config for file uploads
        // More info: https://github.com/mscdex/busboy#busboy-methods
        busboyConfig: {
          limits: {
            files: 10,
            fileSize: 100 * 1024 * 1024, // 100MB per file
          },
        },

        // Aliases for specific routes
        // You can define custom routes here
        aliases: {
          // Health check endpoint
          "GET /health": "proxy.health",

          // Multi-file upload — custom handler parses all files from the
          // multipart form, then calls upload.uploadFiles with all files
          // in a single action call, so ONE metadata event is emitted.
          "POST /sessions/:sessionId/upload"(
            this: GatewayServiceThis,
            req: GatewayRequest,
            res: ServerResponse,
          ) {
            const sessionId = req.$params?.sessionId;

            // Extract auth info from request headers (same as onBeforeCall)
            const authHeader = req.headers.authorization;
            const token = authHeader?.startsWith("Bearer ")
              ? authHeader.slice(7)
              : undefined;
            const clientIP =
              (req.headers["x-forwarded-for"] as string) ||
              req.connection?.remoteAddress;
            const userAgent = req.headers["user-agent"];

            // Parse multipart form data — collect ALL files into memory
            const files: Array<{
              data: Buffer;
              filename: string;
              mimetype: string;
            }> = [];
            const filePromises: Array<Promise<void>> = [];

            const bb = new Busboy({
              headers: req.headers as Record<string, string>,
              limits: { files: 10, fileSize: 100 * 1024 * 1024 },
            });

            bb.on(
              "file",
              (
                _name: string,
                stream: Readable,
                info: { filename: string; mimeType: string },
              ) => {
                filePromises.push(
                  new Promise<void>((resolve, reject) => {
                    const chunks: Buffer[] = [];
                    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
                    stream.on("end", () => {
                      files.push({
                        data: Buffer.concat(chunks),
                        filename: info.filename,
                        mimetype: info.mimeType,
                      });
                      resolve();
                    });
                    stream.on("error", reject);
                  }),
                );
              },
            );

            bb.on("finish", () => {
              // Wait for all file streams to finish before calling the action
              Promise.all(filePromises)
                .then(() =>
                  this.broker.call(
                    "upload.uploadFiles",
                    { files, sessionId },
                    {
                      meta: { clientIP, token, userAgent },
                      timeout: 600000,
                    },
                  ),
                )
                .then((result: unknown) => {
                  res.writeHead(200, {
                    "Content-Type": "application/json; charset=utf-8",
                  });
                  res.end(JSON.stringify(result));
                })
                .catch((err: Error & { code?: number | string }) => {
                  const statusCode =
                    typeof err.code === "number" &&
                    err.code >= 100 &&
                    err.code < 600
                      ? err.code
                      : 500;
                  res.setHeader(
                    "Content-Type",
                    "application/json; charset=utf-8",
                  );
                  res.writeHead(statusCode);
                  res.end(
                    JSON.stringify({
                      code: statusCode,
                      message: err.message,
                      success: false,
                    }),
                  );
                });
            });

            bb.on("error", (err: Error) => {
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.writeHead(400);
              res.end(
                JSON.stringify({
                  code: 400,
                  message: err.message || "Failed to parse upload",
                  success: false,
                }),
              );
            });

            req.pipe(bb);
          },
        },

        // Calling options
        callOptions: {
          timeout: 600000, // 2 minutes (large file uploads)
          retries: 0,
        },

        // Before call hook - add request headers to context meta
        onBeforeCall(
          ctx: Context<unknown, GatewayMeta>,
          _: object,
          req: GatewayRequest,
          _res: ServerResponse,
        ): void {
          // Set request headers to context meta
          ctx.meta.userAgent = req.headers["user-agent"];
          ctx.meta.clientIP =
            (req.headers["x-forwarded-for"] as string) ||
            req.connection?.remoteAddress;

          // Extract JWT token from Authorization header and set to meta.token
          // This enables authentication in defineAction via ctx.meta.token
          const authHeader = req.headers.authorization;
          if (authHeader?.startsWith("Bearer ")) {
            ctx.meta.token = authHeader.slice(7);
          }
        },

        // After call hook - can modify response data
        onAfterCall(
          _ctx: Context,
          _route: object,
          _req: GatewayRequest,
          _res: ServerResponse,
          data: unknown,
        ): unknown {
          // You can modify the response data here
          return data;
        },

        // Error handler
        onError(
          _req: GatewayRequest,
          res: ServerResponse,
          err: Error & { code?: number | string },
        ): void {
          const statusCode =
            typeof err.code === "number" && err.code >= 100 && err.code < 600
              ? err.code
              : 500;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.writeHead(statusCode);
          res.end(
            JSON.stringify({
              code: statusCode,
              message: err.message,
              success: false,
            }),
          );
        },
      },
    ],

    // Global error handler
    onError(
      _req: GatewayRequest,
      res: ServerResponse,
      err: Error & { code?: number | string },
    ): void {
      const statusCode =
        typeof err.code === "number" && err.code >= 100 && err.code < 600
          ? err.code
          : 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.writeHead(statusCode);
      res.end(
        JSON.stringify({
          code: statusCode,
          message: err.message,
          success: false,
        }),
      );
    },
  },

  // Service actions
  actions: {
    /**
     * Health check action
     */
    health: {
      rest: "GET /health",
      async handler(): Promise<object> {
        return {
          status: "ok",
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
        };
      },
    },
  },

  // Lifecycle events
  created(): void {
    const self = this as unknown as GatewayServiceThis;
    self.logger.info("API Gateway service created");
  },

  async started(): Promise<void> {
    const self = this as unknown as GatewayServiceThis;
    self.logger.info(
      `API Gateway listening on http://${self.settings.ip}:${self.settings.port}`,
    );
  },

  async stopped(): Promise<void> {
    const self = this as unknown as GatewayServiceThis;
    self.logger.info("API Gateway service stopped");
  },
};

export default ApiGatewayService;
