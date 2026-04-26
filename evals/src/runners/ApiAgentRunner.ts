import type {
  AIAdapter,
  AIProviderType,
  CreateAIAdapterOptions,
} from "core.lib/adapters/ai";
import { createAIAdapter } from "core.lib/adapters/ai";
import type { AgentRunner, AgentRunResult } from "../types";

const DEFAULT_SYSTEM_PROMPT = [
  "You are being evaluated as a data-analysis coding agent.",
  "Answer the user's prompt directly and practically.",
  "Do not invent facts, datasets, metrics, or calculations that were not provided.",
  "Ask clarifying questions when the prompt lacks enough information.",
  "Use TypeScript-oriented guidance for coding prompts.",
].join(" ");

export interface ApiAgentRunnerOptions {
  adapter?: AIAdapter;
  adapterOptions?: CreateAIAdapterOptions;
  systemPrompt?: string;
  temperature?: number;
}

export class ApiAgentRunner implements AgentRunner {
  readonly name: string;
  private adapter?: AIAdapter;
  private readonly adapterOptions?: CreateAIAdapterOptions;
  private readonly systemPrompt: string;
  private readonly temperature: number;

  constructor(options: ApiAgentRunnerOptions = {}) {
    this.adapter = options.adapter;
    this.adapterOptions = options.adapterOptions;
    this.name = this.getRunnerName(options);
    this.systemPrompt = options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    this.temperature =
      options.temperature ?? Number(process.env.AGENT_EVAL_TEMPERATURE ?? 0.2);
  }

  static fromEnvironment(): ApiAgentRunner {
    return new ApiAgentRunner({
      adapterOptions: {
        apiKey: process.env.AGENT_EVAL_API_KEY,
        host: process.env.AGENT_EVAL_HOST,
        model: process.env.AGENT_EVAL_MODEL,
        provider: process.env.AGENT_EVAL_PROVIDER as AIProviderType | undefined,
      },
      systemPrompt: process.env.AGENT_EVAL_SYSTEM_PROMPT,
    });
  }

  async run(prompt: string): Promise<AgentRunResult> {
    try {
      const result = await this.getAdapter().generateText({
        prompt,
        systemPrompt: this.systemPrompt,
        temperature: this.temperature,
      });
      return { response: result.content.trim() };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
        response: "",
      };
    }
  }

  private getAdapter(): AIAdapter {
    this.adapter ??= createAIAdapter(this.adapterOptions);
    return this.adapter;
  }

  private getRunnerName(options: ApiAgentRunnerOptions): string {
    if (options.adapter) {
      const config = options.adapter.getConfig();
      return `ApiAgentRunner(${config.provider}:${config.defaultModel})`;
    }

    const provider =
      options.adapterOptions?.provider ?? process.env.AI_PROVIDER ?? "ollama";
    const model = options.adapterOptions?.model ?? "default";
    return `ApiAgentRunner(${provider}:${model})`;
  }
}
