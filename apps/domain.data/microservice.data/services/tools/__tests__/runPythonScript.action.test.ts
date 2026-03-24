/**
 * Tests for tools/runPythonScript.action.ts
 */

import { createTestContext } from "core.lib/testing";

// Mock child_process.spawn to simulate the Docker sandbox
const mockStdout = { on: jest.fn() };
const mockStderr = { on: jest.fn() };
const mockStdin = { end: jest.fn(), write: jest.fn() };
const mockProc = {
  on: jest.fn(),
  stderr: mockStderr,
  stdin: mockStdin,
  stdout: mockStdout,
};

jest.mock("node:child_process", () => ({
  spawn: jest.fn(() => mockProc),
}));

jest.mock("../../../db", () => ({
  get dataSource() {
    return {};
  },
}));

import runPythonScriptAction from "../runPythonScript.action";

function simulateSuccessfulExecution(stdout: string) {
  mockStdout.on.mockImplementation(
    (event: string, cb: (data: Buffer) => void) => {
      if (event === "data") cb(Buffer.from(stdout));
    },
  );
  mockStderr.on.mockImplementation(() => {});
  mockProc.on.mockImplementation(
    (event: string, cb: (code: number) => void) => {
      if (event === "close") cb(0);
    },
  );
}

function simulateFailedExecution(stderr: string) {
  mockStdout.on.mockImplementation(() => {});
  mockStderr.on.mockImplementation(
    (event: string, cb: (data: Buffer) => void) => {
      if (event === "data") cb(Buffer.from(stderr));
    },
  );
  mockProc.on.mockImplementation(
    (event: string, cb: (code: number) => void) => {
      if (event === "close") cb(1);
    },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("tools.runPythonScript action", () => {
  it("should execute target tool and run Python code", async () => {
    simulateSuccessfulExecution("Processing 3 records...\n");

    const ctx = createTestContext({
      params: {
        pythonCode: "print(f'Processing {len(input_data)} records...')",
        targetTool: "sampleData",
        toolParams: { datasetId: "ds-1", fromRecord: 0, toRecord: 3 },
      },
      callStubs: {
        "tools.sampleData": [
          { age: "30", name: "Alice" },
          { age: "25", name: "Bob" },
          { age: "35", name: "Charlie" },
        ],
      },
    });

    const result = await runPythonScriptAction.handler(ctx);

    expect(result.success).toBe(true);
    expect(result.output).toContain("Processing 3 records...");
  });

  it("should return error when Python code fails", async () => {
    simulateFailedExecution("NameError: name 'undefined_var' is not defined");

    const ctx = createTestContext({
      params: {
        pythonCode: "print(undefined_var)",
        targetTool: "sampleData",
        toolParams: { datasetId: "ds-1", fromRecord: 0, toRecord: 3 },
      },
      callStubs: {
        "tools.sampleData": [{ name: "Alice" }],
      },
    });

    const result = await runPythonScriptAction.handler(ctx);

    expect(result.success).toBe(false);
    expect(result.output).toContain("NameError");
  });

  it("should throw when target tool fails", async () => {
    const ctx = createTestContext({
      params: {
        pythonCode: "print('hello')",
        targetTool: "nonExistentTool",
        toolParams: {},
      },
    });

    await expect(runPythonScriptAction.handler(ctx)).rejects.toThrow(
      'Failed to execute target tool "nonExistentTool"',
    );
  });
});
