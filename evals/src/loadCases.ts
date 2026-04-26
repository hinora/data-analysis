import { promises as fs } from "node:fs";
import path from "node:path";
import type { EvalCase, EvalConfig } from "./types";

const CASES_DIR = path.resolve(process.cwd(), "evals/cases");
const CONFIG_PATH = path.resolve(process.cwd(), "evals/eval.config.json");

export async function loadConfig(): Promise<EvalConfig> {
  const config = JSON.parse(await fs.readFile(CONFIG_PATH, "utf8")) as EvalConfig;
  return config;
}

export async function loadCases(): Promise<EvalCase[]> {
  const filenames = (await fs.readdir(CASES_DIR))
    .filter((filename) => filename.endsWith(".json"))
    .sort();
  const groups = await Promise.all(
    filenames.map(async (filename) => {
      const filePath = path.join(CASES_DIR, filename);
      const parsed = JSON.parse(await fs.readFile(filePath, "utf8")) as EvalCase[] | EvalCase;
      return Array.isArray(parsed) ? parsed : [parsed];
    }),
  );
  return groups.flat().map(validateCase);
}

function validateCase(evalCase: EvalCase): EvalCase {
  if (!evalCase.category || !evalCase.id || !evalCase.prompt) {
    throw new Error(`Invalid eval case: ${JSON.stringify(evalCase)}`);
  }
  if (!Number.isFinite(evalCase.maxScore) || evalCase.maxScore <= 0) {
    throw new Error(`Invalid maxScore for eval case: ${evalCase.id}`);
  }
  return {
    critical: false,
    expectedKeywords: [],
    forbiddenKeywords: [],
    requiredBehavior: [],
    requiresClarification: false,
    requiresCode: false,
    ...evalCase,
  };
}
