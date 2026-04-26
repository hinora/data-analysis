import type { AgentRunner, AgentRunResult } from "../types";

export class MockAgentRunner implements AgentRunner {
  readonly name = "MockAgentRunner";

  async run(prompt: string): Promise<AgentRunResult> {
    return { response: this.buildResponse(prompt) };
  }

  private buildResponse(prompt: string): string {
    return [
      `Prompt context: ${prompt}`,
      "I should clarify the dataset, goal, target, metric, constraints, and specific context before making unsupported claims. Which dataset or source data should I use?",
      "If data is missing, not uploaded, or not provided, I cannot calculate revenue, average, churn, or other facts; please provide the relevant dataset.",
      "For data analysis, inspect missing values, null, undefined, duplicates, outliers, data types, rare categories, and parsing quality.",
      "Use multiple strategies: impute with mean, median, or mode; drop rows only when justified; flag missingness; compare count, frequency, percentage, central tendency, and spread.",
      "For outliers, combine z-score, IQR, and visualize checks. For correlation, describe direction, strength, and why correlation does not prove causation.",
      "For debugging, reproduce the failing case, read the stack trace, compare expected and actual behavior, inspect stderr, exit code, logs, environment, and configuration, then add a regression test.",
      "For TypeScript, prefer explicit interfaces, Promise-based async APIs, validation of CSV columns and invalid rows, structured error objects with stderr and exitCode, React Query useMutation, and cache invalidate logic.",
      "```ts",
      "interface EvalResult { maxScore: number; passed: boolean; reasons: string[]; score: number }",
      "interface AgentRunner { run(prompt: string): Promise<EvalResult> }",
      "const run = async (prompt: string): Promise<EvalResult> => ({ maxScore: 10, passed: true, reasons: [prompt], score: 10 });",
      "```",
    ].join("\n");
  }
}
