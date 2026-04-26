import type { CategoryScore, EvalCase, ScoreResult } from "./types";

const CODE_PATTERNS = [
  /```[\s\S]*```/,
  /\b(function|interface|type|const|let|class|async|await)\b/,
  /=>/,
];
const HALLUCINATION_PATTERNS = [
  /\b(the|your|this) dataset (shows|contains|has|includes|proves)\b/i,
  /\b(the|your|this) data (shows|contains|has|includes|proves)\b/i,
  /\bI (found|calculated|analyzed|computed)\b/i,
  /\b(the average|the median|the correlation|the total|the exact value) is\b/i,
  /\b\d+(\.\d+)?%\b/,
];
const STOPWORDS = new Set([
  "a",
  "about",
  "an",
  "and",
  "are",
  "as",
  "can",
  "do",
  "does",
  "for",
  "from",
  "how",
  "i",
  "in",
  "is",
  "it",
  "me",
  "my",
  "of",
  "on",
  "or",
  "the",
  "to",
  "what",
  "when",
  "with",
  "you",
]);

export function calculateCategoryScores(
  results: ScoreResult[],
): CategoryScore[] {
  const categories = new Map<string, { maxScore: number; score: number }>();
  for (const result of results) {
    const current = categories.get(result.category) ?? {
      maxScore: 0,
      score: 0,
    };
    current.maxScore += result.maxScore;
    current.score += result.score;
    categories.set(result.category, current);
  }
  return [...categories.entries()]
    .map(([category, score]) => ({
      category,
      maxScore: score.maxScore,
      percentage:
        score.maxScore === 0 ? 0 : (score.score / score.maxScore) * 100,
      score: score.score,
    }))
    .sort((left, right) => left.category.localeCompare(right.category));
}

export function scoreResponse(
  evalCase: EvalCase,
  response: string,
): ScoreResult {
  const normalizedResponse = normalize(response);
  const reasons: string[] = [];

  if (!normalizedResponse) {
    return {
      caseId: evalCase.id,
      category: evalCase.category,
      maxScore: evalCase.maxScore,
      passed: false,
      reasons: ["Response is empty"],
      score: 0,
    };
  }

  let earned = 0;
  let possible = 0;

  possible += 1;
  earned += 1;
  reasons.push("Response is not empty");

  possible += 3;
  earned +=
    scoreExpectedKeywords({ evalCase, normalizedResponse, reasons }) * 3;

  possible += 1.5;
  earned +=
    scoreForbiddenKeywords({ evalCase, normalizedResponse, reasons }) * 1.5;

  possible += 1;
  earned += scorePromptCoverage({ evalCase, normalizedResponse, reasons });

  possible += 1;
  earned += scoreRequiredBehavior({ evalCase, normalizedResponse, reasons });

  if (evalCase.requiresCode) {
    possible += 1;
    earned += scoreCode({ normalizedResponse, reasons });
  }

  if (evalCase.requiresClarification) {
    possible += 1;
    earned += scoreClarification({ normalizedResponse, reasons });
  }

  possible += 1.5;
  const hallucinationScore = scoreHallucinationResistance({
    evalCase,
    normalizedResponse,
    reasons,
  });
  earned += hallucinationScore * 1.5;

  const rawScore = Math.max(
    0,
    Math.round((earned / possible) * evalCase.maxScore),
  );
  const score = evalCase.critical && hallucinationScore === 0 ? 0 : rawScore;
  const passed = score >= evalCase.maxScore * 0.7;

  return {
    caseId: evalCase.id,
    category: evalCase.category,
    maxScore: evalCase.maxScore,
    passed,
    reasons,
    score,
  };
}

function containsAnyCode(response: string): boolean {
  return CODE_PATTERNS.some((pattern) => pattern.test(response));
}

function containsKeyword(response: string, keyword: string): boolean {
  return response.includes(normalize(keyword));
}

function hasClarifyingQuestion(response: string): boolean {
  return (
    response.includes("?") &&
    /\b(clarify|which|what|when|where|who|specific|provide|share|more detail|dataset|goal)\b/i.test(
      response,
    )
  );
}

function hasHallucinatedFacts(evalCase: EvalCase, response: string): boolean {
  const promptHasData =
    /\b(csv|json|table|row|column|sample|dataset:|data:)\b/i.test(
      evalCase.prompt,
    );
  if (promptHasData) {
    return false;
  }
  return HALLUCINATION_PATTERNS.some((pattern) => pattern.test(response));
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function promptTerms(prompt: string): string[] {
  return normalize(prompt)
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !STOPWORDS.has(word));
}

function scoreClarification(req: {
  normalizedResponse: string;
  reasons: string[];
}): number {
  if (hasClarifyingQuestion(req.normalizedResponse)) {
    req.reasons.push("Asked a clarifying question");
    return 1;
  }
  req.reasons.push("Missing clarifying question");
  return 0;
}

function scoreCode(req: {
  normalizedResponse: string;
  reasons: string[];
}): number {
  if (containsAnyCode(req.normalizedResponse)) {
    req.reasons.push("Included code-like content");
    return 1;
  }
  req.reasons.push("Missing required code-like content");
  return 0;
}

function scoreExpectedKeywords(req: {
  evalCase: EvalCase;
  normalizedResponse: string;
  reasons: string[];
}): number {
  const keywords = req.evalCase.expectedKeywords ?? [];
  if (keywords.length === 0) {
    req.reasons.push("No expected keywords configured");
    return 1;
  }
  let found = 0;
  for (const keyword of keywords) {
    if (containsKeyword(req.normalizedResponse, keyword)) {
      found += 1;
      req.reasons.push(`Found expected keyword: ${keyword}`);
    } else {
      req.reasons.push(`Missing expected keyword: ${keyword}`);
    }
  }
  return found / keywords.length;
}

function scoreForbiddenKeywords(req: {
  evalCase: EvalCase;
  normalizedResponse: string;
  reasons: string[];
}): number {
  const forbidden = req.evalCase.forbiddenKeywords ?? [];
  const found = forbidden.filter((keyword) =>
    containsKeyword(req.normalizedResponse, keyword),
  );
  if (found.length === 0) {
    req.reasons.push("No forbidden keywords found");
    return 1;
  }
  for (const keyword of found) {
    req.reasons.push(`Found forbidden keyword: ${keyword}`);
  }
  return 0;
}

function scoreHallucinationResistance(req: {
  evalCase: EvalCase;
  normalizedResponse: string;
  reasons: string[];
}): number {
  if (hasHallucinatedFacts(req.evalCase, req.normalizedResponse)) {
    req.reasons.push(
      "Detected likely hallucinated facts not supported by the prompt",
    );
    return 0;
  }
  req.reasons.push("No likely hallucinated facts detected");
  return 1;
}

function scorePromptCoverage(req: {
  evalCase: EvalCase;
  normalizedResponse: string;
  reasons: string[];
}): number {
  const terms = promptTerms(req.evalCase.prompt);
  if (terms.length === 0) {
    req.reasons.push("Prompt has no significant terms to match");
    return 1;
  }
  const matched = terms.filter((term) => req.normalizedResponse.includes(term));
  if (matched.length > 0) {
    req.reasons.push(
      `Addressed prompt terms: ${matched.slice(0, 5).join(", ")}`,
    );
    return 1;
  }
  req.reasons.push("Response does not clearly address the prompt terms");
  return 0;
}

function scoreRequiredBehavior(req: {
  evalCase: EvalCase;
  normalizedResponse: string;
  reasons: string[];
}): number {
  const behaviors = req.evalCase.requiredBehavior ?? [];
  if (behaviors.length === 0) {
    req.reasons.push("No required behavior configured");
    return 1;
  }
  let found = 0;
  for (const behavior of behaviors) {
    const terms = promptTerms(behavior);
    const matched = terms.filter((term) =>
      req.normalizedResponse.includes(term),
    );
    if (terms.length === 0 || matched.length >= Math.ceil(terms.length / 2)) {
      found += 1;
      req.reasons.push(`Met required behavior: ${behavior}`);
    } else {
      req.reasons.push(`Missing required behavior: ${behavior}`);
    }
  }
  return found / behaviors.length;
}
