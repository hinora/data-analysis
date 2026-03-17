/**
 * AI Adapter Mock
 *
 * Returns a Jest-mocked AIAdapter whose methods can be configured per test.
 * By default every method returns a sensible no-op/empty result.
 *
 * Also exports `mockCreateAIAdapter()` which patches the factory so that
 * any code calling `createAIAdapter()` receives the mock instead.
 */

import type {
  AIAdapter,
  AIProviderConfig,
  ChatWithToolsResponse,
  GenerateEmbeddingsResult,
  GenerateJSONResult,
  GenerateTextResult,
} from "../adapters/ai/types";

// ---------------------------------------------------------------------------
// Default stub return values
// ---------------------------------------------------------------------------

const defaultTextResult: GenerateTextResult = {
  content: "mock-text-response",
  completionTokens: 10,
  promptTokens: 5,
  totalTokens: 15,
  durationMs: 100,
  model: "mock-model",
};

const defaultJSONResult: GenerateJSONResult = {
  data: {},
  rawResponse: "{}",
  completionTokens: 10,
  promptTokens: 5,
  totalTokens: 15,
  durationMs: 100,
  model: "mock-model",
};

const defaultChatWithToolsResult: ChatWithToolsResponse = {
  content: "mock-chat-response",
  reasoning: null,
  toolCalls: [],
  completionTokens: 10,
  promptTokens: 5,
  totalTokens: 15,
  durationMs: 100,
  model: "mock-model",
};

const defaultEmbeddingsResult: GenerateEmbeddingsResult = {
  embeddings: [[0.1, 0.2, 0.3]],
  dimensions: 3,
  durationMs: 50,
  model: "mock-embed-model",
};

const defaultConfig: AIProviderConfig = {
  provider: "ollama",
  defaultModel: "mock-model",
  host: "http://mock:11434",
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a mock AI adapter with all methods stubbed via jest.fn().
 *
 * @example
 * ```ts
 * const ai = createMockAIAdapter();
 *
 * // Override a specific return value for this test
 * ai.generateText.mockResolvedValueOnce({
 *   ...defaultTextResult,
 *   content: "custom response",
 * });
 *
 * // Pass the mock where createAIAdapter() is normally called
 * ```
 */
export function createMockAIAdapter(): jest.Mocked<AIAdapter> {
  return {
    generateText: jest.fn().mockResolvedValue(defaultTextResult),
    generateJSON: jest.fn().mockResolvedValue(defaultJSONResult),
    chatWithTools: jest.fn().mockResolvedValue(defaultChatWithToolsResult),
    generateEmbeddings: jest.fn().mockResolvedValue(defaultEmbeddingsResult),
    getConfig: jest.fn().mockReturnValue(defaultConfig),
    isAvailable: jest.fn().mockResolvedValue(true),
  };
}

/**
 * Convenience re-export of default stub values so tests can spread & override.
 */
export const aiDefaults = {
  textResult: defaultTextResult,
  jsonResult: defaultJSONResult,
  chatWithToolsResult: defaultChatWithToolsResult,
  embeddingsResult: defaultEmbeddingsResult,
};
