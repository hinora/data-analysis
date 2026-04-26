import { exec } from "node:child_process";
import type { AgentRunner, AgentRunResult } from "../types";

export class CommandAgentRunner implements AgentRunner {
  readonly name = "CommandAgentRunner";

  constructor(private readonly command: string) {}

  async run(prompt: string): Promise<AgentRunResult> {
    return new Promise((resolve) => {
      const child = exec(
        this.command,
        {
          env: { ...process.env, AGENT_EVAL_PROMPT: prompt },
          timeout: 120_000,
        },
        (error, stdout, stderr) => {
          if (error) {
            resolve({
              error: error.message,
              exitCode: error.code,
              response: stdout.trim(),
              stderr: stderr.trim(),
            });
            return;
          }
          resolve({
            response: stdout.trim(),
            stderr: stderr.trim() || undefined,
          });
        },
      );
      child.stdin?.end(prompt);
    });
  }
}
