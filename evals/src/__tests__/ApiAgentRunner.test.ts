import type {
  AIAdapter,
  AIProviderConfig,
  GenerateTextResult,
} from "core.lib/adapters/ai";
import { ApiAgentRunner } from "../runners/ApiAgentRunner";

function createAdapter(
  req: { generateText?: AIAdapter["generateText"] } = {},
): AIAdapter {
  const config: AIProviderConfig = {
    defaultModel: "test-model",
    provider: "ollama",
  };
  return {
    chatWithTools: jest.fn(),
    generateEmbeddings: jest.fn(),
    generateJSON: jest.fn(),
    generateText:
      req.generateText ??
      jest.fn(
        async (): Promise<GenerateTextResult> => ({
          completionTokens: 1,
          content: "API response",
          durationMs: 1,
          model: "test-model",
          promptTokens: 1,
          totalTokens: 2,
        }),
      ),
    getConfig: () => config,
    isAvailable: jest.fn(),
  };
}

describe("ApiAgentRunner", () => {
  it("returns generated API text as the agent response", async () => {
    const adapter = createAdapter();
    const runner = new ApiAgentRunner({ adapter });

    await expect(runner.run("Hello")).resolves.toEqual({
      response: "API response",
    });
  });

  it("passes the prompt and system prompt to the adapter", async () => {
    const generateText = jest.fn(
      async (): Promise<GenerateTextResult> => ({
        completionTokens: 1,
        content: "Done",
        durationMs: 1,
        model: "test-model",
        promptTokens: 1,
        totalTokens: 2,
      }),
    );
    const runner = new ApiAgentRunner({
      adapter: createAdapter({ generateText }),
      systemPrompt: "Custom system prompt",
      temperature: 0,
    });

    await runner.run("Prompt text");

    expect(generateText).toHaveBeenCalledWith({
      prompt: "Prompt text",
      systemPrompt: "Custom system prompt",
      temperature: 0,
    });
  });

  it("captures adapter errors without throwing", async () => {
    const runner = new ApiAgentRunner({
      adapter: createAdapter({
        generateText: jest.fn(async () => {
          throw new Error("provider unavailable");
        }),
      }),
    });

    await expect(runner.run("Hello")).resolves.toEqual({
      error: "provider unavailable",
      response: "",
    });
  });
});
