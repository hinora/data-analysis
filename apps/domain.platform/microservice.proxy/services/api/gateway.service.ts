import type { IncomingMessage, ServerResponse } from "node:http";
import type { Context, LoggerInstance, ServiceSchema } from "moleculer";
import ApiGateway from "moleculer-web";

/** Gateway request with optional connection info */
interface GatewayRequest {
  connection?: { remoteAddress?: string; socket?: { remoteAddress?: string } };
  headers: IncomingMessage["headers"];
  socket?: { remoteAddress?: string };
}

/** Extended context meta for gateway requests */
interface GatewayMeta {
  clientIP?: string;
  token?: string;
  userAgent?: string;
}

/** Service instance type for lifecycle methods */
interface GatewayServiceThis {
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
            files: 1,
            fileSize: 100 * 1024 * 1024, // 100MB
          },
        },

        // Aliases for specific routes
        // You can define custom routes here
        aliases: {
          // Health check endpoint
          "GET /health": "proxy.health",

          // File upload — multipart mode so busboy parses and sets ctx.meta.filename/mimetype
          "POST /sessions/:sessionId/upload": "multipart:upload.uploadFile",
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
          err: Error & { code?: number },
        ): void {
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.writeHead(err.code || 500);
          res.end(
            JSON.stringify({
              success: false,
              message: err.message,
              code: err.code || 500,
            }),
          );
        },
      },
    ],

    // Global error handler
    onError(
      _req: GatewayRequest,
      res: ServerResponse,
      err: Error & { code?: number },
    ): void {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.writeHead(err.code || 500);
      res.end(
        JSON.stringify({
          success: false,
          message: err.message,
          code: err.code || 500,
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
