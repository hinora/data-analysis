/**
 * Run Python Script Tool
 *
 * Executes a target tool to retrieve data, injects the result into an
 * isolated Python sandbox as `input_data`, then runs the provided Python
 * code and returns its stdout output.
 */

import { spawn } from "node:child_process";
import type { TypedContext } from "core.lib/__generated__";
import { defineAction } from "core.lib/broker";
import { Errors } from "moleculer";

const EXECUTION_TIMEOUT_MS = 30_000;
const CONTAINER_NAME = "python-sandbox";

export interface RunPythonScriptParams {
  pythonCode: string;
  targetTool: string;
  toolParams: Record<string, unknown>;
}

export interface RunPythonScriptResult {
  output: string;
  success: boolean;
}

export default defineAction<RunPythonScriptParams, RunPythonScriptResult>({
  params: {
    pythonCode: { type: "string" },
    targetTool: { type: "string" },
    toolParams: { type: "object" },
  },

  async handler(
    ctx: TypedContext<RunPythonScriptParams>,
  ): Promise<RunPythonScriptResult> {
    const { pythonCode, targetTool, toolParams } = ctx.params;

    // 1. Resolve the target tool action name
    const actionName = `tools.${targetTool}`;

    // 2. Execute the target tool to retrieve data
    let toolResult: unknown;
    try {
      toolResult = await ctx.call(actionName, toolParams);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Errors.MoleculerClientError(
        `Failed to execute target tool "${targetTool}": ${msg}`,
        422,
        "TARGET_TOOL_ERROR",
      );
    }

    // 3. Build the Python script with data injected via json.loads
    const dataJson = JSON.stringify(toolResult);
    const fullScript = [
      "import json",
      `input_data = json.loads(${JSON.stringify(dataJson)})`,
      pythonCode,
    ].join("\n");

    // 4. Execute in the Python sandbox container
    const { stderr, stdout } = await runInSandbox(fullScript);

    if (stderr) {
      return { output: stderr, success: false };
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
