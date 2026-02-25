/**
 * Gemini Adapter (Stub)
 *
 * Future implementation for Google Gemini AI provider.
 * Currently a stub that throws NotImplemented errors.
 */

import type {
  AIAdapter,
  AIProviderConfig,
  GenerateJSONParams,
  GenerateJSONResult,
  GenerateTextParams,
  GenerateTextResult,
} from "./types";

export interface GeminiAdapterOptions {
  /** API key for Gemini */
  apiKey?: string;
  /** Model to use (default: gemini-pro) */
  model?: string;
}

/**
 * Gemini AI Adapter (Stub)
 *
 * This is a placeholder for future Google Gemini integration.
 */
export class GeminiAdapter implements AIAdapter {
  readonly source = "gemini" as const;
  readonly provider = "gemini";
  readonly model: string;

  private readonly apiKey: string;

  constructor(options: GeminiAdapterOptions = {}) {
    this.apiKey = options.apiKey || process.env.GEMINI_API_KEY || "";
    this.model = options.model || "gemini-pro";
  }

  /**
   * Get provider configuration
   */
  getConfig(): AIProviderConfig {
    return {
      apiKey: this.apiKey,
      defaultModel: this.model,
      provider: "gemini",
    };
  }

  /**
   * Check if Gemini is available
   */
  async isAvailable(): Promise<boolean> {
    // TODO: Implement API key validation
    return false;
  }

  /**
   * Generate text response (stub)
   */
  async generateText(_params: GenerateTextParams): Promise<GenerateTextResult> {
    throw new Error(
      "GeminiAdapter.generateText is not yet implemented. " +
        "Please use AI_PROVIDER=ollama or implement this method.",
    );
  }

  /**
   * Generate JSON response (stub)
   */
  async generateJSON<T>(
    _params: GenerateJSONParams,
  ): Promise<GenerateJSONResult<T>> {
    throw new Error(
      "GeminiAdapter.generateJSON is not yet implemented. " +
        "Please use AI_PROVIDER=ollama or implement this method.",
    );
  }
}
