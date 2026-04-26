import type { AgentRunResult, AgentRunner } from "../types";

export class MockAgentRunner implements AgentRunner {
  readonly name = "MockAgentRunner";

  async run(prompt: string): Promise<AgentRunResult> {
    return { response: this.buildResponse(prompt) };
  }

  private buildResponse(prompt: string): string {
    const lowerPrompt = prompt.toLowerCase();
    if (/\b(ambiguous|improve it|fix it|analyze this|dashboard|model)\b/.test(lowerPrompt)) {
      return [
        "I need clarification before proceeding.",
        "Which dataset, target outcome, constraints, and success criteria should I use?",
        "Please provide the relevant data, error message, or desired TypeScript behavior so I avoid guessing.",
      ].join(" ");
    }
    if (/\b(no data|without data|haven't uploaded|not provided|missing dataset|which product|revenue|churn)\b/.test(lowerPrompt)) {
      return [
        "I cannot calculate or claim facts because no dataset or rows were provided.",
        "Share the data or schema and I can compute the result. Until then, I can only describe the method and limitations.",
      ].join(" ");
    }
    if (/\btypescript|code|function|interface|react|node|parse|csv|generic\b/.test(lowerPrompt)) {
      return [
        "Use a typed TypeScript implementation with explicit interfaces, validation, and clear error handling.",
        "```ts",
        "interface Result { ok: boolean; message: string }",
        "const run = async (): Promise<Result> => ({ ok: true, message: \"validated\" });",
        "```",
        "Handle null and undefined inputs and add tests for edge cases.",
      ].join("\n");
    }
    if (/\b(error|bug|debug|fails|exception|stack|test|undefined|null)\b/.test(lowerPrompt)) {
      return [
        "Start by reproducing the bug, reading the stack trace, and isolating the failing input.",
        "Check logs, null or undefined values, async timing, configuration, and recent changes.",
        "Add a small regression test once the root cause is confirmed.",
      ].join(" ");
    }
    return [
      "For data analysis, first inspect schema, data types, missing values, null and undefined values, duplicates, and outliers.",
      "Use multiple strategies such as dropping rows, imputing with mean/median/mode, flagging missingness, or segment-specific imputation.",
      "Choose each strategy based on the analysis goal, missingness pattern, sample size, and risk of bias.",
    ].join(" ");
  }
}
