/**
 * Gemini AI Adapter
 *
 * Implementation of AIAdapter for Google Gemini API.
 * Default model: gemini-2.0-flash
 * Per constitution: max 3 retries with exponential backoff on failure.
 */

import {
  type Content,
  type FunctionDeclarationSchema,
  GoogleGenerativeAI,
  type Part,
  SchemaType,
} from "@google/generative-ai";
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

const DEFAULT_MODEL = "gemini-2.0-flash";
const DEFAULT_EMBEDDING_MODEL = "text-embedding-004";
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

export interface GeminiAdapterOptions {
  /** API key for Gemini */
  apiKey?: string;
  /** Default model (default: gemini-2.0-flash) */
  model?: string;
}

/**
 * Map JSON Schema type strings to Gemini SchemaType enum values.
 */
function mapSchemaType(type: string): SchemaType {
  const typeMap: Record<string, SchemaType> = {
    array: SchemaType.ARRAY,
    boolean: SchemaType.BOOLEAN,
    integer: SchemaType.INTEGER,
    number: SchemaType.NUMBER,
    object: SchemaType.OBJECT,
    string: SchemaType.STRING,
  };
  return typeMap[type] || SchemaType.STRING;
}

/**
 * Convert a ToolPropertySchema-like structure to Gemini's FunctionDeclarationSchema.
 * Recursively transforms nested objects and arrays with `type` as an enum.
 */
function toGeminiSchema(schema: {
  description?: string;
  enum?: string[];
  items?: Record<string, unknown>;
  properties?: Record<string, unknown>;
  required?: string[];
  type: string;
}): FunctionDeclarationSchema {
  const result = {
    type: mapSchemaType(schema.type),
  } as Record<string, unknown>;

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
    const props: Record<string, FunctionDeclarationSchema> = {};
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

  return result as unknown as FunctionDeclarationSchema;
}

/**
 * Gemini AI Adapter
 *
 * Implements the AIAdapter interface for Google Gemini API.
 */
export class GeminiAdapter implements AIAdapter {
  private client: GoogleGenerativeAI;
  private config: AIProviderConfig;

  constructor(options: GeminiAdapterOptions = {}) {
    const apiKey = options.apiKey || process.env.GEMINI_API_KEY || "";
    const model = options.model || process.env.GEMINI_MODEL || DEFAULT_MODEL;

    if (!apiKey) {
      throw new Error(
        "Gemini API key is required. Set GEMINI_API_KEY environment variable or pass apiKey option.",
      );
    }

    this.client = new GoogleGenerativeAI(apiKey);
    this.config = {
      apiKey,
      defaultModel: model,
      provider: "gemini",
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
      const genModel = this.client.getGenerativeModel({
        generationConfig: {
          temperature: params.temperature ?? 0.7,
        },
        model,
        ...(systemInstruction ? { systemInstruction } : {}),
      });

      return genModel.generateContent({ contents });
    });

    const durationMs = Date.now() - startTime;
    const result = response.response;
    const content = result.text();
    const usage = result.usageMetadata;

    return {
      completionTokens: usage?.candidatesTokenCount || 0,
      content,
      durationMs,
      model,
      promptTokens: usage?.promptTokenCount || 0,
      totalTokens: usage?.totalTokenCount || 0,
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
      const genModel = this.client.getGenerativeModel({
        generationConfig: {
          responseMimeType: "application/json",
          temperature: params.temperature ?? 0.7,
        },
        model,
        ...(systemInstruction ? { systemInstruction } : {}),
      });

      return genModel.generateContent({ contents });
    });

    const durationMs = Date.now() - startTime;
    const result = response.response;
    const rawResponse = result.text();
    const usage = result.usageMetadata;

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
        const parts: Part[] = [];

        // Add text content if present
        if (msg.content) {
          parts.push({ text: msg.content });
        }

        // Add function calls if present
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
          role: "function" as "user",
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

    const response = await this.executeWithRetry(async () => {
      const genModel = this.client.getGenerativeModel({
        generationConfig: {
          temperature: params.temperature ?? 0.3,
        },
        model,
        ...(systemInstruction ? { systemInstruction } : {}),
        ...(tools ? { tools } : {}),
      });

      return genModel.generateContent({ contents });
    });

    const durationMs = Date.now() - startTime;
    const result = response.response;
    const usage = result.usageMetadata;

    // Extract tool calls and text content from response parts
    const toolCalls: ToolCall[] = [];
    let textContent = "";

    const candidate = result.candidates?.[0];
    if (candidate?.content?.parts) {
      for (const part of candidate.content.parts) {
        if ("functionCall" in part && part.functionCall) {
          toolCalls.push({
            function: {
              arguments: (part.functionCall.args || {}) as Record<
                string,
                unknown
              >,
              name: part.functionCall.name,
            },
          });
        }
        if ("text" in part && part.text) {
          textContent += part.text;
        }
      }
    }

    return {
      completionTokens: usage?.candidatesTokenCount || 0,
      content: textContent,
      durationMs,
      model,
      promptTokens: usage?.promptTokenCount || 0,
      toolCalls,
      totalTokens: usage?.totalTokenCount || 0,
    };
  }

  async generateEmbeddings(
    params: GenerateEmbeddingsParams,
  ): Promise<GenerateEmbeddingsResult> {
    const startTime = Date.now();
    const model = params.model || DEFAULT_EMBEDDING_MODEL;

    const embeddings: number[][] = [];

    // Gemini embedding API processes one input at a time
    for (const input of params.input) {
      const response = await this.executeWithRetry(async () => {
        const embeddingModel = this.client.getGenerativeModel({ model });
        return embeddingModel.embedContent(input);
      });

      embeddings.push(response.embedding.values);
    }

    const durationMs = Date.now() - startTime;
    const dimensions = embeddings.length > 0 ? embeddings[0].length : 0;

    return {
      dimensions,
      durationMs,
      embeddings,
      model,
    };
  }

  getConfig(): AIProviderConfig {
    return { ...this.config };
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Verify connectivity by listing models
      const model = this.client.getGenerativeModel({
        model: this.config.defaultModel,
      });
      await model.generateContent({
        contents: [{ parts: [{ text: "ping" }], role: "user" }],
      });
      return true;
    } catch {
      return false;
    }
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
