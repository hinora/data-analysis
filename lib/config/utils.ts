/**
 * Configuration Utilities
 */

import merge from "lodash/merge";
import { defaultConfig, getEnvConfig } from "./default";
import type { AppConfig } from "./types";

/**
 * Supported AI providers
 */
export const SUPPORTED_AI_PROVIDERS = ["ollama", "gemini", "lmstudio"] as const;
export type SupportedAIProvider = (typeof SUPPORTED_AI_PROVIDERS)[number];

/**
 * Validate AI_PROVIDER environment variable on startup.
 * If AI_PROVIDER is set, it must be a supported value.
 * If AI_PROVIDER is not set, defaults to "ollama" (no error).
 *
 * Call this early in microservice startup for fail-fast behavior.
 *
 * @throws Error if AI_PROVIDER is set to an unsupported value
 * @returns The validated provider name
 *
 * @example
 * ```typescript
 * import { validateAIProvider } from "core.lib/config";
 *
 * // In app.ts or moleculer.config.ts startup
 * validateAIProvider(); // throws if AI_PROVIDER=invalid
 * ```
 */
export function validateAIProvider(): SupportedAIProvider {
  const provider = process.env.AI_PROVIDER?.toLowerCase();

  if (!provider) {
    return "ollama"; // default
  }

  if (!SUPPORTED_AI_PROVIDERS.includes(provider as SupportedAIProvider)) {
    throw new Error(
      `[AI Config] Unsupported AI_PROVIDER="${process.env.AI_PROVIDER}". ` +
        `Supported providers: ${SUPPORTED_AI_PROVIDERS.join(", ")}. ` +
        `Set AI_PROVIDER to one of these values or remove it to use the default (ollama).`,
    );
  }

  return provider as SupportedAIProvider;
}

/**
 * Generate a random string of specified length
 * @param length - Length of the random string
 * @returns Random alphanumeric string
 */
function generateRandomString(length: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Create a configuration by merging default config with custom overrides
 *
 * @param overrides - Custom configuration to override defaults
 * @returns Merged configuration
 *
 * @example
 * ```typescript
 * import { defineConfig } from "core.lib/config";
 *
 * export default defineConfig({
 *   nodeID: "auth-service",
 *   logLevel: "debug",
 *   transporter: "nats://localhost:4222"
 * });
 * ```
 */
export function defineConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  // Merge: default -> env-specific -> user overrides
  return merge({}, defaultConfig, getEnvConfig(), overrides);
}

/**
 * Extend an existing configuration with additional overrides
 *
 * @param baseConfig - Base configuration to extend
 * @param overrides - Additional configuration to merge
 * @returns Extended configuration
 *
 * @example
 * ```typescript
 * import { extendConfig, defaultConfig } from "core.lib/config";
 *
 * const authConfig = extendConfig(defaultConfig, {
 *   nodeID: "auth-service",
 *   metadata: { region: "us-east-1" }
 * });
 * ```
 */
export function extendConfig(
  baseConfig: AppConfig,
  overrides: Partial<AppConfig>,
): AppConfig {
  return merge({}, baseConfig, overrides);
}

/**
 * Create a node-specific configuration
 * Automatically sets nodeID based on node name with random suffix for uniqueness
 *
 * @param nodeName - Name of the node
 * @param overrides - Custom configuration overrides
 * @returns Configuration for the node
 *
 * @example
 * ```typescript
 * import { createNodeConfig } from "core.lib/config";
 *
 * export default createNodeConfig("auth", {
 *   logLevel: "debug",
 *   transporter: "nats://localhost:4222"
 * });
 * // nodeID will be "auth-a1b2c" (with random suffix)
 * ```
 */
export function createNodeConfig(
  nodeName: string,
  overrides: Partial<AppConfig> = {},
): AppConfig {
  const randomSuffix = generateRandomString(5);
  return defineConfig({
    nodeID: `${nodeName}-${randomSuffix}`,
    ...overrides,
  });
}
