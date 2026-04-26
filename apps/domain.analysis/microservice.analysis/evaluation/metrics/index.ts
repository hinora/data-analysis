/**
 * Metrics Index
 *
 * Exports all metric runner functions, the MetricRunner type, and the
 * ALL_METRICS array used as the default metric set by the runner.
 */

import type { EvalCase, EvalResult, ScoreResult } from "../types";
import { confidenceCalibrationMetric } from "./confidence-calibration.metric";
import { efficiencyMetric } from "./efficiency.metric";
import { faithfulnessMetric } from "./faithfulness.metric";
import { relevanceMetric } from "./relevance.metric";
import { toolAccuracyMetric } from "./tool-accuracy.metric";

/** A function that scores one evaluation result against its case definition. */
export type MetricRunner = (
  evalCase: EvalCase,
  result: EvalResult,
) => ScoreResult;

export {
  confidenceCalibrationMetric,
  efficiencyMetric,
  faithfulnessMetric,
  relevanceMetric,
  toolAccuracyMetric,
};

/** All metrics run by default during evaluation. Ordered alphabetically. */
export const ALL_METRICS: MetricRunner[] = [
  confidenceCalibrationMetric,
  efficiencyMetric,
  faithfulnessMetric,
  relevanceMetric,
  toolAccuracyMetric,
];
