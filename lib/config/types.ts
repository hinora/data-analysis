/**
 * Configuration Types
 */

import type { BrokerOptions } from "moleculer";

/**
 * Extended App Configuration
 */
export interface AppConfig extends BrokerOptions {
  /** Path to the services folder (default: "./services") */
  servicesPath?: string;

  /**
   * Skip registering process event handlers (beforeExit, exit, SIGINT, SIGTERM)
   * Set to true when using custom runner to avoid double signal handling
   * @default true (handled by our runner instead)
   */
  skipProcessEventRegistration?: boolean;
}

/**
 * Retry Policy Configuration
 */
export interface RetryPolicyConfig {
  /** Enable retry policy */
  enabled: boolean;
  /** Number of retries */
  retries: number;
  /** Delay between retries in ms */
  delay: number;
  /** Maximum delay between retries in ms */
  maxDelay: number;
  /** Backoff factor */
  factor: number;
  /** Check function to determine if error is retryable */
  check: (err: Error & { retryable?: boolean }) => boolean;
}

/**
 * Circuit Breaker Configuration
 */
export interface CircuitBreakerConfig {
  /** Enable circuit breaker */
  enabled: boolean;
  /** Threshold for opening circuit (0-1) */
  threshold: number;
  /** Window time in seconds */
  windowTime: number;
  /** Minimum requests before circuit can open */
  minRequestCount: number;
  /** Half-open time in seconds */
  halfOpenTime: number;
}

/**
 * Bulkhead Configuration
 */
export interface BulkheadConfig {
  /** Enable bulkhead */
  enabled: boolean;
  /** Maximum concurrent executions */
  concurrency: number;
  /** Maximum queue size */
  maxQueueSize: number;
}

/**
 * Tracking Configuration
 */
export interface TrackingConfig {
  /** Enable request tracking */
  enabled: boolean;
  /** Shutdown timeout in ms */
  shutdownTimeout: number;
}

/**
 * Registry Configuration
 */
export interface RegistryConfig {
  /** Load balancing strategy */
  strategy: "RoundRobin" | "Random" | "CpuUsage" | "Latency" | "Shard";
  /** Prefer local services */
  preferLocal: boolean;
}
