/**
 * Fixtures Index
 *
 * Exports all evaluation fixtures and the ALL_FIXTURES array
 * used by the evaluation runner.
 */

import type { EvalCase } from "../types";
import { caseConfidence } from "./case-confidence";
import { caseMultiIteration } from "./case-multi-iteration";
import { caseStructuredBasic } from "./case-structured-basic";
import { caseStructuredFilter } from "./case-structured-filter";
import { caseSubAgent } from "./case-sub-agent";
import { caseUnstructuredRag } from "./case-unstructured-rag";
import { caseWrongToolType } from "./case-wrong-tool-type";

export {
  caseConfidence,
  caseMultiIteration,
  caseStructuredBasic,
  caseStructuredFilter,
  caseSubAgent,
  caseUnstructuredRag,
  caseWrongToolType,
};

/** All evaluation fixtures, ordered from simplest to most complex. */
export const ALL_FIXTURES: EvalCase[] = [
  caseStructuredBasic,
  caseStructuredFilter,
  caseUnstructuredRag,
  caseMultiIteration,
  caseSubAgent,
  caseWrongToolType,
  caseConfidence,
];
