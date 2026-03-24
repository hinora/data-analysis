/**
 * Tests for tools/generateChartSpec.action.ts
 */

import { defineTest } from "core.lib/testing";
import type { ChartSpec } from "../generateChartSpec.action";
import generateChartSpecAction from "../generateChartSpec.action";

describe("tools.generateChartSpec action", () => {
  defineTest({
    name: "should return a bar chart spec",
    action: generateChartSpecAction,
    params: {
      chartType: "bar",
      data: [
        { label: "Q1", value: 100 },
        { label: "Q2", value: 200 },
        { label: "Q3", value: 150 },
      ],
      title: "Quarterly Revenue",
      xAxisLabel: "Quarter",
      yAxisLabel: "Revenue ($)",
    },
    assertResult: (result: ChartSpec) => {
      expect(result.chartType).toBe("bar");
      expect(result.title).toBe("Quarterly Revenue");
      expect(result.data).toHaveLength(3);
      expect(result.data[0]).toEqual({ label: "Q1", value: 100 });
      expect(result.data[1]).toEqual({ label: "Q2", value: 200 });
      expect(result.data[2]).toEqual({ label: "Q3", value: 150 });
      expect(result.xAxisLabel).toBe("Quarter");
      expect(result.yAxisLabel).toBe("Revenue ($)");
    },
  });

  defineTest({
    name: "should return a pie chart spec",
    action: generateChartSpecAction,
    params: {
      chartType: "pie",
      data: [
        { label: "Desktop", value: 60 },
        { label: "Mobile", value: 30 },
        { label: "Tablet", value: 10 },
      ],
      title: "Traffic by Device",
    },
    assertResult: (result: ChartSpec) => {
      expect(result.chartType).toBe("pie");
      expect(result.title).toBe("Traffic by Device");
      expect(result.data).toHaveLength(3);
      expect(result.xAxisLabel).toBeUndefined();
      expect(result.yAxisLabel).toBeUndefined();
    },
  });

  defineTest({
    name: "should return a line chart spec",
    action: generateChartSpecAction,
    params: {
      chartType: "line",
      data: [
        { label: "Jan", value: 10 },
        { label: "Feb", value: 20 },
      ],
      title: "Monthly Trend",
      xAxisLabel: "Month",
    },
    assertResult: (result: ChartSpec) => {
      expect(result.chartType).toBe("line");
      expect(result.title).toBe("Monthly Trend");
      expect(result.data).toHaveLength(2);
      expect(result.xAxisLabel).toBe("Month");
      expect(result.yAxisLabel).toBeUndefined();
    },
  });

  defineTest({
    name: "should coerce label to string and value to number",
    action: generateChartSpecAction,
    params: {
      chartType: "bar",
      data: [
        { label: 123 as unknown as string, value: "42" as unknown as number },
      ],
      title: "Coercion Test",
    },
    assertResult: (result: ChartSpec) => {
      expect(result.data[0].label).toBe("123");
      expect(result.data[0].value).toBe(42);
    },
  });

  defineTest({
    name: "should include datasetName when provided",
    action: generateChartSpecAction,
    params: {
      chartType: "bar",
      data: [
        { label: "A", value: 10 },
        { label: "B", value: 20 },
      ],
      datasetName: "Sales Data",
      title: "Sales by Category",
    },
    assertResult: (result: ChartSpec) => {
      expect(result.chartType).toBe("bar");
      expect(result.title).toBe("Sales by Category");
      expect(result.datasetName).toBe("Sales Data");
    },
  });

  defineTest({
    name: "should omit datasetName when not provided",
    action: generateChartSpecAction,
    params: {
      chartType: "pie",
      data: [{ label: "X", value: 1 }],
      title: "No Source",
    },
    assertResult: (result: ChartSpec) => {
      expect(result.datasetName).toBeUndefined();
    },
  });
});
