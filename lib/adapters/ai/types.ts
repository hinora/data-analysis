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
   * Chat with tool-calling support
   * @param params - Messages, tools, and options
   * @returns Response with content or tool calls
   */
  chatWithTools(params: ChatWithToolsParams): Promise<ChatWithToolsResponse>;

  /**
   * Generate vector embeddings for text inputs
   * @param params - Text inputs and model selection
   * @returns Embedding vectors
   */
  generateEmbeddings(
    params: GenerateEmbeddingsParams,
  ): Promise<GenerateEmbeddingsResult>;

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

// ============================================================================
// Tool-Calling Types (T007)
// ============================================================================

/**
 * JSON Schema definition for tool parameters
 */
/**
 * Property definition within a tool parameter schema
 */
export interface ToolPropertySchema {
  description?: string;
  enum?: string[];
  items?: ToolPropertySchema & {
    properties?: Record<string, ToolPropertySchema>;
    required?: string[];
  };
  properties?: Record<string, ToolPropertySchema>;
  required?: string[];
  type: string;
}

export interface ToolParameterSchema {
  description?: string;
  properties: Record<string, ToolPropertySchema>;
  required?: string[];
  type: "object";
}

/**
 * Definition of a tool that the AI can call
 */
export interface ToolDefinition {
  function: {
    description: string;
    name: string;
    parameters: ToolParameterSchema;
  };
  type: "function";
}

/**
 * A tool call made by the AI model
 */
export interface ToolCall {
  function: {
    arguments: Record<string, unknown>;
    name: string;
  };
  id?: string;
}

/**
 * Result from executing a tool call
 */
export interface ToolCallResult {
  content: string;
  toolCallId?: string;
}

/**
 * Extended AI message role including tool messages
 */
export type AIMessageWithToolRole = "assistant" | "system" | "tool" | "user";

/**
 * Message that can include tool calls (from assistant) or tool results
 */
export interface AIMessageWithTools {
  /**
   * Opaque provider-specific parts from the model response.
   * When present on an assistant message the adapter should replay these
   * verbatim instead of reconstructing parts from `content` / `toolCalls`.
   * Used by Gemini to preserve `thoughtSignature` across multi-turn tool calls.
   */
  _rawAssistantParts?: unknown[];
  content: string;
  role: AIMessageWithToolRole;
  toolCallId?: string;
  toolCalls?: ToolCall[];
  /** Tool name for role:"tool" messages (identifies which tool produced the result) */
  toolName?: string;
}

/**
 * Parameters for chat with tool-calling support
 */
export interface ChatWithToolsParams {
  /** Conversation messages including tool results */
  messages: AIMessageWithTools[];
  /** Model to use */
  model?: string;
  /**
   * Optional callback invoked with content token chunks as the model generates them.
   * When provided (together with onReasoning), the adapter streams content tokens
   * incrementally instead of returning them only in the final response.
   */
  onContent?: (chunk: string) => void;
  /**
   * Optional callback invoked with reasoning chunks as the model generates them.
   * When provided, the adapter should use streaming mode so that chain-of-thought
   * content inside `<think>` tags is forwarded incrementally.
   */
  onReasoning?: (chunk: string) => void;
  /** Temperature for randomness (0-1) */
  temperature?: number;
  /** Available tools for the AI to call */
  tools: ToolDefinition[];
}

/**
 * Response from chat with tool-calling
 */
export interface ChatWithToolsResponse {
  /** Completion tokens used */
  completionTokens: number;
  /** Text content (final answer or empty if tool calls) */
  content: string;
  /** Processing duration in milliseconds */
  durationMs: number;
  /** Model used */
  model: string;
  /** Prompt tokens used */
  promptTokens: number;
  /**
   * Opaque provider-specific parts from the model response.
   * Should be stored on the assistant message and passed back so the adapter
   * can replay them verbatim (e.g. Gemini thought signatures).
   */
  _rawAssistantParts?: unknown[];
  /** Internal reasoning / chain-of-thought extracted from the model (e.g. <think> tags) */
  reasoning: string | null;
  /** Tool calls requested by the AI (empty if final answer) */
  toolCalls: ToolCall[];
  /** Total tokens used */
  totalTokens: number;
}

// ============================================================================
// Embedding Types (T007)
// ============================================================================

/**
 * Parameters for generating embeddings
 */
export interface GenerateEmbeddingsParams {
  /** Text inputs to embed (batch support) */
  input: string[];
  /** Embedding model to use (e.g., "nomic-embed-text") */
  model?: string;
}

/**
 * Result from generating embeddings
 */
export interface GenerateEmbeddingsResult {
  /** Number of dimensions per embedding */
  dimensions: number;
  /** Processing duration in milliseconds */
  durationMs: number;
  /** Generated embeddings (one per input) */
  embeddings: number[][];
  /** Model used */
  model: string;
}
