/**
 * Generate Chart Spec Tool
 *
 * Produces a strictly typed ChartSpec JSON object from pre-aggregated data.
 * The AI orchestrator calls this tool after gathering data via
 * aggregation/retrieval tools. The returned spec drives a dynamic chart
 * component on the frontend.
 */

import type { TypedContext } from "core.lib/__generated__";
import { defineAction } from "core.lib/broker";

// ---------------------------------------------------------------------------
// ChartSpec types — keep in sync with frontend/src/hooks/useChat.ts
// ---------------------------------------------------------------------------

export type ChartType = "bar" | "line" | "pie";

export interface ChartDataPoint {
  label: string;
  value: number;
}

export interface ChartSpec {
  chartType: ChartType;
  data: ChartDataPoint[];
  title: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
}

// ---------------------------------------------------------------------------
// Action params
// ---------------------------------------------------------------------------

export interface GenerateChartSpecParams {
  /** Chart type to generate */
  chartType: "bar" | "line" | "pie";
  /** Pre-aggregated data points for the chart */
  data: ChartDataPoint[];
  /** Chart title */
  title: string;
  /** Optional X-axis label */
  xAxisLabel?: string;
  /** Optional Y-axis label */
  yAxisLabel?: string;
}

const MAX_DATA_POINTS = 200;

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

export default defineAction<GenerateChartSpecParams, ChartSpec>({
  params: {
    chartType: {
      type: "enum",
      values: ["bar", "line", "pie"],
    },
    data: {
      type: "array",
      items: {
        type: "object",
        props: {
          label: { type: "string" },
          value: { type: "number" },
        },
      },
      max: MAX_DATA_POINTS,
      min: 1,
    },
    title: { type: "string", min: 1 },
    xAxisLabel: { type: "string", optional: true },
    yAxisLabel: { type: "string", optional: true },
  },

  handler(ctx: TypedContext<GenerateChartSpecParams>): ChartSpec {
    const { chartType, data, title, xAxisLabel, yAxisLabel } = ctx.params;

    const spec: ChartSpec = {
      chartType,
      data: data.map((d) => ({
        label: String(d.label),
        value: Number(d.value),
      })),
      title,
    };

    if (xAxisLabel) spec.xAxisLabel = xAxisLabel;
    if (yAxisLabel) spec.yAxisLabel = yAxisLabel;

    return spec;
  },
});
