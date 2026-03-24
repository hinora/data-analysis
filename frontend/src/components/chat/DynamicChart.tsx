/**
 * DynamicChart Component
 *
 * Renders an interactive chart based on a ChartSpec object.
 * Supports bar, line, and pie chart types via Recharts.
 * Handles fallback states for invalid or missing data.
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartSpec } from "../../hooks/useChat";

interface DynamicChartProps {
  spec: ChartSpec;
}

const CHART_COLORS = [
  "#0088FE",
  "#00C49F",
  "#FFBB28",
  "#FF8042",
  "#8884d8",
  "#82ca9d",
  "#ffc658",
  "#d0ed57",
  "#a4de6c",
  "#8dd1e1",
];

function isValidSpec(spec: ChartSpec): boolean {
  if (!spec || typeof spec !== "object") return false;
  if (!["bar", "line", "pie"].includes(spec.chartType)) return false;
  if (!Array.isArray(spec.data) || spec.data.length === 0) return false;
  if (typeof spec.title !== "string" || spec.title.length === 0) return false;
  return spec.data.every(
    (d) => typeof d.label === "string" && typeof d.value === "number",
  );
}

function BarChartRenderer({ spec }: DynamicChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={spec.data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          label={
            spec.xAxisLabel
              ? { value: spec.xAxisLabel, position: "insideBottom", offset: -5 }
              : undefined
          }
        />
        <YAxis
          label={
            spec.yAxisLabel
              ? {
                  value: spec.yAxisLabel,
                  angle: -90,
                  position: "insideLeft",
                }
              : undefined
          }
        />
        <Tooltip />
        <Bar dataKey="value" fill="#0088FE" />
      </BarChart>
    </ResponsiveContainer>
  );
}

function LineChartRenderer({ spec }: DynamicChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={spec.data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          label={
            spec.xAxisLabel
              ? { value: spec.xAxisLabel, position: "insideBottom", offset: -5 }
              : undefined
          }
        />
        <YAxis
          label={
            spec.yAxisLabel
              ? {
                  value: spec.yAxisLabel,
                  angle: -90,
                  position: "insideLeft",
                }
              : undefined
          }
        />
        <Tooltip />
        <Line
          type="monotone"
          dataKey="value"
          stroke="#0088FE"
          strokeWidth={2}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function formatPieLabel(props: { name?: string; percent?: number }): string {
  const { name, percent } = props;
  return `${name ?? ""} (${((percent ?? 0) * 100).toFixed(0)}%)`;
}

function PieChartRenderer({ spec }: DynamicChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={spec.data}
          dataKey="value"
          nameKey="label"
          cx="50%"
          cy="50%"
          outerRadius={100}
          label={formatPieLabel}
        >
          {spec.data.map((entry, index) => (
            <Cell
              key={`cell-${entry.label}`}
              fill={CHART_COLORS[index % CHART_COLORS.length]}
            />
          ))}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

export default function DynamicChart({ spec }: DynamicChartProps) {
  if (!isValidSpec(spec)) {
    return (
      <div
        style={{
          padding: "12px",
          backgroundColor: "#fef3cd",
          border: "1px solid #ffc107",
          borderRadius: "8px",
          color: "#856404",
          fontSize: "13px",
          marginTop: "8px",
        }}
      >
        ⚠️ Unable to render chart: invalid specification.
      </div>
    );
  }

  return (
    <div
      style={{
        marginTop: "12px",
        padding: "16px",
        backgroundColor: "#fff",
        borderRadius: "8px",
        border: "1px solid #e2e2e2",
      }}
    >
      <h4
        style={{
          margin: "0 0 12px 0",
          fontSize: "14px",
          fontWeight: 600,
          color: "#333",
          textAlign: "center",
        }}
      >
        📊 {spec.title}
      </h4>

      {spec.chartType === "bar" && <BarChartRenderer spec={spec} />}
      {spec.chartType === "line" && <LineChartRenderer spec={spec} />}
      {spec.chartType === "pie" && <PieChartRenderer spec={spec} />}

      {spec.datasetNames && spec.datasetNames.length > 0 && (
        <div
          style={{
            marginTop: "8px",
            fontSize: "11px",
            color: "#888",
            textAlign: "right",
          }}
        >
          Source: {spec.datasetNames.join(", ")}
        </div>
      )}
    </div>
  );
}
