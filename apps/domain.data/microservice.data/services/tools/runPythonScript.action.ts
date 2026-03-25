/**
 * Run Python Script Tool
 *
 * Executes one or more tools to retrieve data, collects their results
 * into an ordered array, injects it into an isolated Python sandbox as
 * `input_data`, then runs the provided Python code and returns its
 * stdout output.
 */

import { spawn } from "node:child_process";
import type { TypedContext } from "core.lib/__generated__";
import { defineAction } from "core.lib/broker";
import { Errors } from "moleculer";

const EXECUTION_TIMEOUT_MS = 30_000;
const CONTAINER_NAME = "python-sandbox";

export interface ToolCall {
  name: string;
  params: Record<string, unknown>;
}

export interface RunPythonScriptParams {
  pythonCode: string;
  tools: ToolCall[];
}

export interface RunPythonScriptResult {
  output: string;
  success: boolean;
}

export default defineAction<RunPythonScriptParams, RunPythonScriptResult>({
  params: {
    pythonCode: { type: "string" },
    tools: {
      type: "array",
      items: {
        type: "object",
        props: {
          name: { type: "string" },
          params: { type: "object" },
        },
      },
      min: 1,
    },
  },

  async handler(
    ctx: TypedContext<RunPythonScriptParams>,
  ): Promise<RunPythonScriptResult> {
    const { pythonCode, tools } = ctx.params;

    // 1. Execute each tool sequentially and collect results in order
    const toolResults: unknown[] = [];
    for (const tool of tools) {
      const actionName = `tools.${tool.name}`;
      try {
        const result = await ctx.call(actionName, tool.params);
        toolResults.push(result);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Errors.MoleculerClientError(
          `Failed to execute tool "${tool.name}": ${msg}`,
          422,
          "TOOL_EXECUTION_ERROR",
        );
      }
    }

    // 2. Build the Python script with data injected via json.loads
    const dataJson = JSON.stringify(toolResults);
    const fullScript = [
      "import json",
      `input_data = json.loads(${JSON.stringify(dataJson)})`,
      pythonCode,
    ].join("\n");

    // 3. Execute in the Python sandbox container
    const { stderr, stdout } = await runInSandbox(fullScript);

    if (stderr) {
      const combined = stdout ? `${stdout}\n${stderr}` : stderr;
      return { output: combined, success: false };
    }

    return { output: stdout, success: true };
  },
});

function runInSandbox(
  script: string,
): Promise<{ stderr: string; stdout: string }> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const proc = spawn("docker", [
      "exec",
      "-i",
      CONTAINER_NAME,
      "python3",
      "-",
    ]);

    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        proc.kill("SIGKILL");
        resolve({ stderr: "Execution timed out", stdout });
      }
    }, EXECUTION_TIMEOUT_MS);

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(
          new Errors.MoleculerClientError(
            `Python sandbox execution failed: ${err.message}`,
            500,
            "SANDBOX_ERROR",
          ),
        );
      }
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        if (code === 0) {
          resolve({ stderr, stdout });
        } else {
          resolve({
            stderr: stderr || `Process exited with code ${code}`,
            stdout,
          });
        }
      }
    });

    proc.stdin.write(script);
    proc.stdin.end();
  });
}
