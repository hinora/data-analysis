/**
 * Gemini AI Adapter
 *
 * Implementation of AIAdapter for Google Gemini API using the @google/genai SDK.
 * Default model: gemini-2.5-flash
 * Supports reasoning/thinking via thinkingConfig (Gemini 2.5+ models).
 * Per constitution: max 3 retries with exponential backoff on failure.
 */

import type { Content, Part } from "@google/genai";
import { GoogleGenAI, Type } from "@google/genai";
import type {
  AIAdapter,
  AIProviderConfig,
  ChatWithToolsParams,
  ChatWithToolsResponse,
  GenerateEmbeddingsParams,
  GenerateEmbeddingsResult,
  GenerateJSONParams,
  GenerateJSONResult,
  GenerateTextParams,
  GenerateTextResult,
  ToolCall,
} from "./types";

const DEFAULT_MODEL = "gemini-2.5-flash";
const DEFAULT_EMBEDDING_MODEL = "text-embedding-004";
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

export interface GeminiAdapterOptions {
  /** API key for Gemini */
  apiKey?: string;
  /** Default model (default: gemini-2.5-flash) */
  model?: string;
}

/**
 * Map JSON Schema type strings to Gemini Type enum values.
 */
function mapSchemaType(type: string): Type {
  const typeMap: Record<string, Type> = {
    array: Type.ARRAY,
    boolean: Type.BOOLEAN,
    integer: Type.INTEGER,
    number: Type.NUMBER,
    object: Type.OBJECT,
    string: Type.STRING,
  };
  return typeMap[type] || Type.STRING;
}

/**
 * Convert a ToolPropertySchema-like structure to Gemini's Schema format.
 * Recursively transforms nested objects and arrays with `type` as an enum.
 */
function toGeminiSchema(schema: {
  description?: string;
  enum?: string[];
  items?: Record<string, unknown>;
  properties?: Record<string, unknown>;
  required?: string[];
  type: string;
}): Record<string, unknown> {
  const result: Record<string, unknown> = {
    type: mapSchemaType(schema.type),
  };

  if (schema.description) {
    result.description = schema.description;
  }

  if (schema.enum) {
    result.enum = schema.enum;
  }

  if (schema.required) {
    result.required = schema.required;
  }

  if (schema.properties) {
    const props: Record<string, Record<string, unknown>> = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      if (value && typeof value === "object" && "type" in value) {
        props[key] = toGeminiSchema(
          value as {
            description?: string;
            enum?: string[];
            items?: Record<string, unknown>;
            properties?: Record<string, unknown>;
            required?: string[];
            type: string;
          },
        );
      }
    }
    result.properties = props;
  }

  if (
    schema.items &&
    typeof schema.items === "object" &&
    "type" in schema.items
  ) {
    result.items = toGeminiSchema(
      schema.items as {
        description?: string;
        enum?: string[];
        items?: Record<string, unknown>;
        properties?: Record<string, unknown>;
        required?: string[];
        type: string;
      },
    );
  }

  return result;
}

/**
 * Gemini AI Adapter
 *
 * Implements the AIAdapter interface for Google Gemini API.
 * Uses the @google/genai SDK with thinking/reasoning support for Gemini 2.5+ models.
 */
export class GeminiAdapter implements AIAdapter {
  private client: GoogleGenAI;
  private config: AIProviderConfig;

  constructor(options: GeminiAdapterOptions = {}) {
    const apiKey = options.apiKey || process.env.GEMINI_API_KEY || "";
    const model = options.model || process.env.GEMINI_MODEL || DEFAULT_MODEL;

    if (!apiKey) {
      throw new Error(
        "Gemini API key is required. Set GEMINI_API_KEY environment variable or pass apiKey option.",
      );
    }

    this.client = new GoogleGenAI({ apiKey });
    this.config = {
      apiKey,
      defaultModel: model,
      provider: "gemini",
    };
  }

  async chatWithTools(
    params: ChatWithToolsParams,
  ): Promise<ChatWithToolsResponse> {
    const startTime = Date.now();
    const model = params.model || this.config.defaultModel;

    // Extract system instruction from messages
    let systemInstruction: string | undefined;
    const contents: Content[] = [];

    for (const msg of params.messages) {
      if (msg.role === "system") {
        // Accumulate system messages
        systemInstruction = systemInstruction
          ? `${systemInstruction}\n\n${msg.content}`
          : msg.content;
        continue;
      }

      if (msg.role === "assistant") {
        // Prefer raw parts when available — they preserve thoughtSignature
        // fields required by Gemini for multi-turn tool-calling with thinking.
        if (msg._rawAssistantParts && Array.isArray(msg._rawAssistantParts)) {
          contents.push({
            parts: msg._rawAssistantParts as Part[],
            role: "model",
          });
        } else {
          const parts: Part[] = [];

          if (msg.content) {
            parts.push({ text: msg.content });
          }

          if (msg.toolCalls && msg.toolCalls.length > 0) {
            for (const tc of msg.toolCalls) {
              parts.push({
                functionCall: {
                  args: tc.function.arguments,
                  name: tc.function.name,
                },
              });
            }
          }

          if (parts.length > 0) {
            contents.push({ parts, role: "model" });
          }
        }
        continue;
      }

      if (msg.role === "tool") {
        // Gemini expects functionResponse parts for tool results
        contents.push({
          parts: [
            {
              functionResponse: {
                name: msg.toolName || "unknown",
                response: { result: msg.content },
              },
            },
          ],
          role: "user",
        });
        continue;
      }

      // User messages
      contents.push({
        parts: [{ text: msg.content }],
        role: "user",
      });
    }

    // Convert tool definitions to Gemini format
    const tools =
      params.tools.length > 0
        ? [
            {
              functionDeclarations: params.tools.map((tool) => ({
                description: tool.function.description,
                name: tool.function.name,
                parameters: toGeminiSchema(tool.function.parameters),
              })),
            },
          ]
        : undefined;

    // ── Streaming mode: stream tokens so reasoning can be forwarded live ──
    if (params.onReasoning) {
      return this.chatWithToolsStreaming(
        contents,
        tools,
        model,
        params.temperature ?? 0.3,
        systemInstruction,
        params.onReasoning,
        startTime,
      );
    }

    // ── Non-streaming mode (default) ──
    const response = await this.executeWithRetry(async () => {
      return this.client.models.generateContent({
        config: {
          temperature: params.temperature ?? 0.3,
          thinkingConfig: { includeThoughts: true },
          ...(systemInstruction ? { systemInstruction } : {}),
          ...(tools ? { tools } : {}),
        },
        contents,
        model,
      });
    });

    const durationMs = Date.now() - startTime;
    const usage = response.usageMetadata;

    // Extract tool calls, text content, and reasoning from response parts
    const toolCalls: ToolCall[] = [];
    let textContent = "";
    let reasoning: string | null = null;

    const candidate = response.candidates?.[0];
    if (candidate?.content?.parts) {
      for (const part of candidate.content.parts) {
        if (part.functionCall) {
          toolCalls.push({
            function: {
              arguments: (part.functionCall.args || {}) as Record<
                string,
                unknown
              >,
              name: part.functionCall.name || "",
            },
          });
        }
        if (part.text) {
          if (part.thought) {
            // Thought/reasoning part
            reasoning = reasoning ? `${reasoning}\n${part.text}` : part.text;
          } else {
            textContent += part.text;
          }
        }
      }
    }

    // Also check convenience accessor for function calls
    if (toolCalls.length === 0 && response.functionCalls) {
      for (const fc of response.functionCalls) {
        toolCalls.push({
          function: {
            arguments: (fc.args || {}) as Record<string, unknown>,
            name: fc.name || "",
          },
        });
      }
    }

    // Capture raw parts so callers can pass them back verbatim in multi-turn
    // conversations (preserves thoughtSignature for Gemini thinking models).
    const rawParts = candidate?.content?.parts;

    return {
      _rawAssistantParts: rawParts ? (rawParts as unknown[]) : undefined,
      completionTokens: usage?.candidatesTokenCount || 0,
      content: textContent,
      durationMs,
      model,
      promptTokens: usage?.promptTokenCount || 0,
      reasoning,
      toolCalls,
      totalTokens: usage?.totalTokenCount || 0,
    };
  }

  async generateEmbeddings(
    params: GenerateEmbeddingsParams,
  ): Promise<GenerateEmbeddingsResult> {
    const startTime = Date.now();
    const model = params.model || DEFAULT_EMBEDDING_MODEL;

    const response = await this.executeWithRetry(async () => {
      return this.client.models.embedContent({
        contents: params.input.map((text) => ({
          parts: [{ text }],
          role: "user",
        })),
        model,
      });
    });

    const embeddings: number[][] = (response.embeddings || []).map(
      (e) => e.values || [],
    );
    const durationMs = Date.now() - startTime;
    const dimensions = embeddings.length > 0 ? embeddings[0].length : 0;

    return {
      dimensions,
      durationMs,
      embeddings,
      model,
    };
  }

  async generateJSON<T>(
    params: GenerateJSONParams<T>,
  ): Promise<GenerateJSONResult<T>> {
    const startTime = Date.now();
    const model = params.model || this.config.defaultModel;

    // Build contents
    const contents: Content[] = [];

    if (params.messages) {
      for (const msg of params.messages) {
        if (msg.role === "system") continue;
        contents.push({
          parts: [{ text: msg.content }],
          role: msg.role === "assistant" ? "model" : "user",
        });
      }
    }

    const jsonPrompt = `${params.prompt}\n\nRespond with valid JSON only. No markdown, no code blocks, just raw JSON.`;
    contents.push({ parts: [{ text: jsonPrompt }], role: "user" });

    const systemInstruction =
      params.systemPrompt ||
      params.messages?.find((m) => m.role === "system")?.content;

    const response = await this.executeWithRetry(async () => {
      return this.client.models.generateContent({
        config: {
          responseMimeType: "application/json",
          temperature: params.temperature ?? 0.7,
          ...(systemInstruction ? { systemInstruction } : {}),
        },
        contents,
        model,
      });
    });

    const durationMs = Date.now() - startTime;
    const rawResponse = response.text || "";
    const usage = response.usageMetadata;

    let data: T;
    try {
      data = JSON.parse(rawResponse) as T;
    } catch {
      throw new Error(
        `Failed to parse JSON response: ${rawResponse.substring(0, 200)}`,
      );
    }

    return {
      completionTokens: usage?.candidatesTokenCount || 0,
      data,
      durationMs,
      model,
      promptTokens: usage?.promptTokenCount || 0,
      rawResponse,
      totalTokens: usage?.totalTokenCount || 0,
    };
  }

  async generateText(params: GenerateTextParams): Promise<GenerateTextResult> {
    const startTime = Date.now();
    const model = params.model || this.config.defaultModel;

    // Build contents array
    const contents: Content[] = [];

    // System prompt is handled via systemInstruction, not as a content entry
    if (params.messages) {
      for (const msg of params.messages) {
        if (msg.role === "system") continue; // Handled separately
        contents.push({
          parts: [{ text: msg.content }],
          role: msg.role === "assistant" ? "model" : "user",
        });
      }
    }

    contents.push({ parts: [{ text: params.prompt }], role: "user" });

    const systemInstruction =
      params.systemPrompt ||
      params.messages?.find((m) => m.role === "system")?.content;

    const response = await this.executeWithRetry(async () => {
      return this.client.models.generateContent({
        config: {
          temperature: params.temperature ?? 0.7,
          ...(systemInstruction ? { systemInstruction } : {}),
        },
        contents,
        model,
      });
    });

    const durationMs = Date.now() - startTime;
    const content = response.text || "";
    const usage = response.usageMetadata;

    return {
      completionTokens: usage?.candidatesTokenCount || 0,
      content,
      durationMs,
      model,
      promptTokens: usage?.promptTokenCount || 0,
      totalTokens: usage?.totalTokenCount || 0,
    };
  }

  getConfig(): AIProviderConfig {
    return { ...this.config };
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.client.models.generateContent({
        contents: "ping",
        model: this.config.defaultModel,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Streaming implementation of chatWithTools.
   * Reads parts with `thought: true` and forwards reasoning chunks
   * to the callback in real-time.
   */
  private async chatWithToolsStreaming(
    contents: Content[],
    tools: { functionDeclarations: Record<string, unknown>[] }[] | undefined,
    model: string,
    temperature: number,
    systemInstruction: string | undefined,
    onReasoning: (chunk: string) => void,
    startTime: number,
  ): Promise<ChatWithToolsResponse> {
    const stream = await this.executeWithRetry(async () => {
      return this.client.models.generateContentStream({
        config: {
          temperature,
          thinkingConfig: { includeThoughts: true },
          ...(systemInstruction ? { systemInstruction } : {}),
          ...(tools ? { tools } : {}),
        },
        contents,
        model,
      });
    });

    let fullContent = "";
    let completionTokens = 0;
    let promptTokens = 0;
    let totalTokens = 0;
    const toolCalls: ToolCall[] = [];
    // Accumulate ALL raw parts so we can return them for thought-signature preservation
    const allRawParts: Part[] = [];
    // Buffer reasoning text so we can flush complete lines to the callback
    let reasoningLineBuffer = "";

    for await (const chunk of stream) {
      // Update token counts from the last chunk that has usage metadata
      if (chunk.usageMetadata) {
        completionTokens =
          chunk.usageMetadata.candidatesTokenCount || completionTokens;
        promptTokens = chunk.usageMetadata.promptTokenCount || promptTokens;
        totalTokens = chunk.usageMetadata.totalTokenCount || totalTokens;
      }

      const candidate = chunk.candidates?.[0];
      if (!candidate?.content?.parts) continue;

      for (const part of candidate.content.parts) {
        // Keep every raw part so thought signatures are preserved
        allRawParts.push(part);

        // ── Function calls ──
        if (part.functionCall) {
          toolCalls.push({
            function: {
              arguments: (part.functionCall.args || {}) as Record<
                string,
                unknown
              >,
              name: part.functionCall.name || "",
            },
          });
        }

        if (part.text) {
          if (part.thought) {
            // ── Thinking tokens ──
            reasoningLineBuffer += part.text;
            // Flush complete lines to the callback in real-time
            let nlIdx = reasoningLineBuffer.indexOf("\n");
            while (nlIdx !== -1) {
              const line = reasoningLineBuffer.slice(0, nlIdx).trim();
              if (line) {
                onReasoning(line);
              }
              reasoningLineBuffer = reasoningLineBuffer.slice(nlIdx + 1);
              nlIdx = reasoningLineBuffer.indexOf("\n");
            }
          } else {
            // ── Content tokens ──
            fullContent += part.text;
          }
        }
      }
    }

    // Flush any remaining reasoning buffer
    if (reasoningLineBuffer.trim()) {
      onReasoning(reasoningLineBuffer.trim());
    }

    const durationMs = Date.now() - startTime;

    return {
      _rawAssistantParts:
        allRawParts.length > 0 ? (allRawParts as unknown[]) : undefined,
      completionTokens,
      content: fullContent.trim(),
      durationMs,
      model,
      promptTokens,
      reasoning: null, // Already forwarded via callback
      toolCalls,
      totalTokens,
    };
  }

  /**
   * Execute a function with exponential backoff retry
   * Per constitution: max 3 retries
   */
  private async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < MAX_RETRIES) {
          const delay = BASE_DELAY_MS * 2 ** attempt;
          await this.sleep(delay);
        }
      }
    }

    throw lastError;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
