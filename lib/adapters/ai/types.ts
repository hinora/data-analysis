/**
 * AI Adapter Types
 *
 * Common interfaces for AI providers (Ollama, Gemini, etc.)
 * Per constitution: outputs must include confidence scores
 */

/**
 * Recommendation values per constitution Section III.Output Standards
 */
export enum Recommendation {
  BUY = "BUY",
  HOLD = "HOLD",
  NO_OPINION = "NO_OPINION",
  SELL = "SELL",
  STRONG_BUY = "STRONG_BUY",
  STRONG_SELL = "STRONG_SELL",
}

/**
 * AI message role for chat-based models
 */
export type AIMessageRole = "assistant" | "system" | "user";

/**
 * Single message in a chat conversation
 */
export interface AIMessage {
  content: string;
  role: AIMessageRole;
}

/**
 * Parameters for text generation
 */
export interface GenerateTextParams {
  /** Optional conversation history */
  messages?: AIMessage[];
  /** Model to use (e.g., "qwen3:14b") */
  model?: string;
  /** The prompt to generate from */
  prompt: string;
  /** System prompt for context */
  systemPrompt?: string;
  /** Temperature for randomness (0-1) */
  temperature?: number;
}

/**
 * Result from text generation
 */
export interface GenerateTextResult {
  /** Estimated completion tokens */
  completionTokens: number;
  /** Generated text content */
  content: string;
  /** Processing duration in milliseconds */
  durationMs: number;
  /** The model used */
  model: string;
  /** Estimated prompt tokens */
  promptTokens: number;
  /** Total tokens used */
  totalTokens: number;
}

/**
 * Parameters for JSON generation with schema
 */
export interface GenerateJSONParams<T = unknown> {
  /** Optional conversation history */
  messages?: AIMessage[];
  /** Model to use */
  model?: string;
  /** The prompt requesting JSON output */
  prompt: string;
  /** JSON schema for the expected output */
  schema?: T;
  /** System prompt for context */
  systemPrompt?: string;
  /** Temperature for randomness (0-1) */
  temperature?: number;
}

/**
 * Result from JSON generation
 */
export interface GenerateJSONResult<T = unknown> {
  /** Estimated completion tokens */
  completionTokens: number;
  /** Parsed JSON data */
  data: T;
  /** Processing duration in milliseconds */
  durationMs: number;
  /** The model used */
  model: string;
  /** Estimated prompt tokens */
  promptTokens: number;
  /** Raw response text */
  rawResponse: string;
  /** Total tokens used */
  totalTokens: number;
}

/**
 * AI provider configuration
 */
export interface AIProviderConfig {
  /** API key (if required) */
  apiKey?: string;
  /** Default model to use */
  defaultModel: string;
  /** Host URL for the provider */
  host?: string;
  /** Provider name */
  provider: AIProviderType;
}

/**
 * Supported AI provider types
 */
export type AIProviderType = "gemini" | "ollama";

/**
 * AI Adapter interface
 *
 * All AI providers must implement this interface.
 * Per constitution: max 3 retries with exponential backoff on failure.
 */
export interface AIAdapter {
  /**
   * Generate structured JSON output
   * @param params - Generation parameters including prompt and optional schema
   * @returns Parsed JSON result with token usage
   */
  generateJSON<T>(
    params: GenerateJSONParams<T>,
  ): Promise<GenerateJSONResult<T>>;

  /**
   * Generate text from a prompt
   * @param params - Generation parameters including prompt and options
   * @returns Generated text with token usage stats
   */
  generateText(params: GenerateTextParams): Promise<GenerateTextResult>;

  /**
   * Get the provider configuration
   */
  getConfig(): AIProviderConfig;

  /**
   * Check if the provider is available/healthy
   */
  isAvailable(): Promise<boolean>;
}

/**
 * Options for creating an AI adapter
 */
export interface CreateAIAdapterOptions {
  /** API key override */
  apiKey?: string;
  /** Host URL override */
  host?: string;
  /** Default model override */
  model?: string;
  /** Provider type override (defaults to AI_PROVIDER env var) */
  provider?: AIProviderType;
}
