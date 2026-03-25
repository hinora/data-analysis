/**
 * Run Python Script Tool
 *
 * Executes one or more tools to retrieve data, collects their results
 * into an ordered array, injects it into an isolated Python sandbox as
 * `input_data`, then runs the provided Python code and returns its
 * stdout output.
 */

import { spawn } from "node:child_process";
import type {
  GlobalServiceRegistry,
  TypedContext,
} from "core.lib/__generated__";
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
        const result = await ctx.call(
          actionName as keyof GlobalServiceRegistry,
          tool.params,
        );
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

    // 2. Build the Python script with data injected via base64-encoded JSON
    const dataJson = JSON.stringify(toolResults);
    const base64Data = Buffer.from(dataJson, "utf-8").toString("base64");
    const fullScript = [
      "import json, base64",
      `input_data = json.loads(base64.b64decode("${base64Data}").decode("utf-8"))`,
      pythonCode,
    ].join("\n");

    // 3. Execute in the Python sandbox container
    const { exitCode, stderr, stdout } = await runInSandbox(fullScript);

    if (exitCode !== 0) {
      const typeInfo = toolResults
        .map((r, i) => `  input_data[${i}]: ${describeValue(r)}`)
        .join("\n");
      const errorOutput = [
        stdout,
        stderr,
        `\ninput_data structure:\n${typeInfo}`,
      ]
        .filter(Boolean)
        .join("\n");
      return { output: errorOutput, success: false };
    }

    return { output: stdout, success: true };
  },
});

function describeValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return `string (length ${value.length})`;
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (Array.isArray(value)) {
    if (value.length === 0) return "empty list";
    return `list of ${value.length} ${describeValue(value[0])}`;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>);
    const preview = JSON.stringify(keys.slice(0, 10));
    return `dict with keys: ${preview}${keys.length > 10 ? ` (+${keys.length - 10} more)` : ""}`;
  }
  return typeof value;
}

function runInSandbox(
  script: string,
): Promise<{ exitCode: number; stderr: string; stdout: string }> {
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
        resolve({ exitCode: 1, stderr: "Execution timed out", stdout });
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
        resolve({ exitCode: code ?? 1, stderr, stdout });
      }
    });

    proc.stdin.write(script);
    proc.stdin.end();
  });
}
