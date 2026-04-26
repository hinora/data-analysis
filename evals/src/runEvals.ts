import { loadCases, loadConfig } from "./loadCases";
import { writeMarkdownReport } from "./report";
import { CommandAgentRunner } from "./runners/CommandAgentRunner";
import { MockAgentRunner } from "./runners/MockAgentRunner";
import { calculateCategoryScores, scoreResponse } from "./scoreResponse";
import type {
  AgentRunner,
  CommandError,
  EvalConfig,
  RunnerKind,
  ScoreResult,
} from "./types";

async function main(): Promise<void> {
  try {
    const [config, cases] = await Promise.all([loadConfig(), loadCases()]);
    const runner = createRunner(config, process.argv.slice(2));
    const caseResults: ScoreResult[] = [];
    const commandErrors: CommandError[] = [];

    for (const evalCase of cases) {
      const runResult = await runner.run(evalCase.prompt);
      if (runResult.error) {
        commandErrors.push({
          caseId: evalCase.id,
          error: runResult.error,
          exitCode: runResult.exitCode,
          stderr: runResult.stderr,
        });
      }
      caseResults.push(scoreResponse(evalCase, runResult.response));
    }

    const score = caseResults.reduce(
      (total, result) => total + result.score,
      0,
    );
    const maxScore = caseResults.reduce(
      (total, result) => total + result.maxScore,
      0,
    );
    const percentage = maxScore === 0 ? 0 : (score / maxScore) * 100;
    const hasCriticalZero = caseResults.some((result) => {
      const evalCase = cases.find((item) => item.id === result.caseId);
      return Boolean(
        result.score === 0 &&
          evalCase &&
          (evalCase.critical ||
            config.criticalCategories.includes(evalCase.category)),
      );
    });
    const passed = percentage >= config.passingScorePercent && !hasCriticalZero;
    const evaluationResult = {
      caseResults,
      categoryScores: calculateCategoryScores(caseResults),
      commandErrors,
      maxScore,
      passed,
      percentage,
      runDate: new Date().toISOString(),
      runnerType: runner.name,
      score,
    };

    await writeMarkdownReport(evaluationResult, config.reportPath);
    printSummary({
      maxScore,
      passed,
      percentage,
      reportPath: config.reportPath,
      runnerName: runner.name,
      score,
    });
    process.exitCode = passed ? 0 : 1;
  } catch (error) {
    console.error(
      `Evaluation failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}

function createRunner(config: EvalConfig, args: string[]): AgentRunner {
  const requestedRunner = getRequestedRunner(config, args);
  if (requestedRunner === "command" && process.env.AGENT_EVAL_COMMAND) {
    return new CommandAgentRunner(process.env.AGENT_EVAL_COMMAND);
  }
  if (requestedRunner === "command") {
    console.warn(
      "AGENT_EVAL_COMMAND is not set; falling back to MockAgentRunner.",
    );
  }
  return new MockAgentRunner();
}

function getRequestedRunner(config: EvalConfig, args: string[]): RunnerKind {
  if (args.includes("--command")) {
    return "command";
  }
  if (args.includes("--mock")) {
    return "mock";
  }
  if (config.defaultRunner === "command" && process.env.AGENT_EVAL_COMMAND) {
    return "command";
  }
  return "mock";
}

function printSummary(req: {
  maxScore: number;
  passed: boolean;
  percentage: number;
  reportPath: string;
  runnerName: string;
  score: number;
}): void {
  console.log(`Runner: ${req.runnerName}`);
  console.log(
    `Score: ${req.score} / ${req.maxScore} (${req.percentage.toFixed(1)}%)`,
  );
  console.log(`Status: ${req.passed ? "PASS" : "FAIL"}`);
  console.log(`Report: ${req.reportPath}`);
}

void main();
