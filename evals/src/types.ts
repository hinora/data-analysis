export interface AgentRunResult {
  error?: string;
  exitCode?: number | null;
  response: string;
  stderr?: string;
}

export interface AgentRunner {
  readonly name: string;
  run(prompt: string): Promise<AgentRunResult>;
}

export interface CategoryScore {
  category: string;
  maxScore: number;
  percentage: number;
  score: number;
}

export interface EvalCase {
  category: string;
  critical?: boolean;
  expectedKeywords?: string[];
  forbiddenKeywords?: string[];
  id: string;
  maxScore: number;
  prompt: string;
  requiredBehavior?: string[];
  requiresClarification?: boolean;
  requiresCode?: boolean;
}

export interface EvalConfig {
  criticalCategories: string[];
  defaultRunner: RunnerKind;
  passingScorePercent: number;
  reportPath: string;
}

export interface EvaluationResult {
  caseResults: ScoreResult[];
  categoryScores: CategoryScore[];
  commandErrors: CommandError[];
  maxScore: number;
  passed: boolean;
  percentage: number;
  runDate: string;
  runnerType: string;
  score: number;
}

export interface CommandError {
  caseId: string;
  error: string;
  exitCode?: number | null;
  stderr?: string;
}

export interface Judge {
  score(input: JudgeInput): Promise<JudgeScore>;
}

export interface JudgeInput {
  evalCase: EvalCase;
  response: string;
}

export interface JudgeScore {
  maxScore: number;
  reasons: string[];
  score: number;
}

export type RunnerKind = "api" | "command" | "mock";

export interface ScoreResult {
  caseId: string;
  category: string;
  maxScore: number;
  passed: boolean;
  reasons: string[];
  score: number;
}
