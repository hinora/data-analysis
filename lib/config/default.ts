/**
 * Default Configuration
 * Base configuration that all microservices extend from
 */

import type { AppConfig } from "./types";

/**
 * Default configuration for all microservices
 * Each microservice can override these settings
 */
export const defaultConfig: AppConfig = {
  // ============ General ============
  /** Namespace for node segmentation (e.g., "development", "staging", "production") */
  namespace: process.env.NAMESPACE || "",

  /** Log level */
  logLevel: (process.env.LOG_LEVEL as AppConfig["logLevel"]) || "info",

  /** Enable logger */
  logger: true,

  // ============ Process Event Registration ============
  /** Skip Moleculer's built-in signal handlers (our runner handles this) */
  skipProcessEventRegistration: true,

  // ============ Networking ============
  /** Transporter configuration (NATS, Redis, MQTT, etc.) */
  transporter: process.env.TRANSPORTER || {
    type: "TCP",
    options: {
      maxPacketSize: 10 * 1024 * 1024, // 10 MB
    },
  },

  /** Request timeout in ms (0 = disabled) */
  requestTimeout: Number(process.env.REQUEST_TIMEOUT) || 10000,

  // ============ Retry Policy ============
  retryPolicy: {
    enabled: true,
    retries: 5,
    delay: 100,
    maxDelay: 1000,
    factor: 2,
    check: (err: Error & { retryable?: boolean }) => err && !!err.retryable,
  },

  // ============ Circuit Breaker ============
  circuitBreaker: {
    enabled: true,
    threshold: 0.5,
    windowTime: 60,
    minRequestCount: 20,
    halfOpenTime: 10000,
  },

  // ============ Bulkhead ============
  bulkhead: {
    enabled: false,
    concurrency: 10,
    maxQueueSize: 100,
  },

  // ============ Request Tracking ============
  tracking: {
    enabled: true,
    shutdownTimeout: 5000,
  },

  // ============ Registry ============
  registry: {
    strategy: "RoundRobin",
    preferLocal: true,
  },

  // ============ Heartbeat ============
  /** Heartbeat interval in seconds */
  heartbeatInterval: 5,

  /** Heartbeat timeout in seconds */
  heartbeatTimeout: 15,

  // ============ Call Level ============
  /** Maximum call level (infinite loop protection) */
  maxCallLevel: 100,

  // ============ Context ============
  /** Clone context params (high performance impact) */
  contextParamsCloning: false,

  // ============ Validation ============
  /** Enable parameter validation */
  validator: true,

  // ============ Metrics & Tracing ============
  /** Enable metrics */
  metrics: {
    enabled: process.env.METRICS_ENABLED === "true",
  },

  /** Enable tracing */
  tracing: {
    enabled: process.env.TRACING_ENABLED === "true",
    exporter: "Console",
    events: true,
    stackTrace: true,
  },

  // ============ Hot Reload ============
  /** Enable hot reload in development */
  hotReload: process.env.NODE_ENV === "development",

  // ============ Services ============
  /** Path to services folder */
  servicesPath: "./services",
};

/**
 * Development configuration preset
 */
export const developmentConfig: Partial<AppConfig> = {
  namespace: "development",
  logLevel: "info",
  hotReload: false, // Disabled to avoid issues with ts-node
  metrics: true,
  tracing: {
    enabled: true,
    exporter: "Console",
  },
};

/**
 * Staging configuration preset
 */
export const stagingConfig: Partial<AppConfig> = {
  namespace: "staging",
  logLevel: "info",
  hotReload: false,
  metrics: true,
  tracing: true,
};

/**
 * Production configuration preset
 */
export const productionConfig: Partial<AppConfig> = {
  namespace: "production",
  logLevel: "warn",
  hotReload: false,
  metrics: true,
  tracing: true,
  requestTimeout: 30000,
  retryPolicy: {
    enabled: true,
    retries: 3,
    delay: 200,
    maxDelay: 2000,
    factor: 2,
    check: (err: Error & { retryable?: boolean }) => err && !!err.retryable,
  },
};

/**
 * Get environment-specific configuration
 */
export function getEnvConfig(): Partial<AppConfig> {
  const env = process.env.NODE_ENV || "development";

  switch (env) {
    case "production":
      return productionConfig;
    case "staging":
      return stagingConfig;
    default:
      return developmentConfig;
  }
}
