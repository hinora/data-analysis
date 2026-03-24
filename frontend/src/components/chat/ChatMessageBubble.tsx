/**
 * ChatMessageBubble Component
 *
 * Renders a single chat message with role-specific styling,
 * confidence indicator, cited sources, and tool usage details.
 * Supports inline chart rendering via [chart:N] placeholders.
 */

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChartSpec, ChatMessage } from "../../hooks/useChat";
import DynamicChart from "./DynamicChart";
import ReasoningPanel from "./ReasoningPanel";

interface ChatMessageBubbleProps {
  message: ChatMessage;
}

/**
 * Resolve the list of charts from message metadata.
 */
function resolveCharts(message: ChatMessage): ChartSpec[] {
  if (message.metadata?.charts && message.metadata.charts.length > 0) {
    return message.metadata.charts;
  }
  return [];
}

/** Regex matching `[chart:N]` placeholders in message content. */
const CHART_PLACEHOLDER_RE = /\[chart:(\d+)\]/g;

/**
 * Split message content into interleaved text and chart segments.
 * If no placeholders are found, returns the full content as a single text
 * segment and appends all charts at the end.
 */
function buildContentSegments(
  content: string,
  charts: ChartSpec[],
): Array<{ chart: ChartSpec; type: "chart" } | { text: string; type: "text" }> {
  if (charts.length === 0) {
    return [{ text: content, type: "text" }];
  }

  const segments: Array<
    { chart: ChartSpec; type: "chart" } | { text: string; type: "text" }
  > = [];
  const referencedIndices = new Set<number>();

  let currentIndex = 0;

  // Reset regex state
  CHART_PLACEHOLDER_RE.lastIndex = 0;

  let match = CHART_PLACEHOLDER_RE.exec(content);
  while (match !== null) {
    const chartIndex = Number.parseInt(match[1], 10);

    // Add preceding text if any
    if (match.index > currentIndex) {
      segments.push({
        text: content.slice(currentIndex, match.index),
        type: "text",
      });
    }

    // Add chart if index is valid
    if (chartIndex >= 0 && chartIndex < charts.length) {
      segments.push({ chart: charts[chartIndex], type: "chart" });
      referencedIndices.add(chartIndex);
    }

    currentIndex = match.index + match[0].length;
    match = CHART_PLACEHOLDER_RE.exec(content);
  }

  // Add remaining text after the last placeholder
  if (currentIndex < content.length) {
    segments.push({ text: content.slice(currentIndex), type: "text" });
  }

  // If no placeholders were found, return content + all charts at the end
  if (referencedIndices.size === 0) {
    return [
      { text: content, type: "text" },
      ...charts.map((chart) => ({ chart, type: "chart" as const })),
    ];
  }

  // Append any charts that were not referenced by a placeholder
  for (let i = 0; i < charts.length; i++) {
    if (!referencedIndices.has(i)) {
      segments.push({ chart: charts[i], type: "chart" });
    }
  }

  return segments;
}

export default function ChatMessageBubble({ message }: ChatMessageBubbleProps) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";

  const charts = isAssistant ? resolveCharts(message) : [];
  const segments = isAssistant
    ? buildContentSegments(message.content, charts)
    : [{ text: message.content, type: "text" as const }];

  return (
    <div
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        marginBottom: "12px",
        paddingLeft: isUser ? "48px" : "0",
        paddingRight: isUser ? "0" : "48px",
      }}
    >
      <div
        style={{
          maxWidth: "85%",
          padding: "12px 16px",
          borderRadius: isUser ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
          backgroundColor: isUser ? "#0066cc" : "#f0f0f0",
          color: isUser ? "#ffffff" : "#1a1a1a",
          fontSize: "14px",
          lineHeight: "1.5",
          wordBreak: "break-word",
        }}
      >
        {/* Message content with inline charts */}
        {segments.map((segment) =>
          segment.type === "text" ? (
            <div
              key={`text-${segment.text.slice(0, 32)}`}
              className={isUser ? "markdown-user" : "markdown-assistant"}
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {segment.text}
              </ReactMarkdown>
            </div>
          ) : (
            <DynamicChart
              key={`chart-${segment.chart.title}`}
              spec={segment.chart}
            />
          ),
        )}

        {/* Confidence score */}
        {isAssistant && message.confidenceScore != null && (
          <div
            style={{
              marginTop: "8px",
              fontSize: "12px",
              color: isUser ? "rgba(255,255,255,0.7)" : "#666",
            }}
          >
            Confidence: {(message.confidenceScore * 100).toFixed(0)}%
          </div>
        )}

        {/* Reasoning panel (reasoning steps, tools, cited sources) */}
        {isAssistant && (
          <ReasoningPanel
            citedSources={message.citedSources}
            reasoningSteps={message.reasoningSteps}
            toolsUsed={message.toolsUsed}
          />
        )}

        {/* Prompt stats */}
        {isAssistant && message.promptStats && (
          <div
            style={{
              marginTop: "6px",
              fontSize: "11px",
              color: "#999",
              display: "flex",
              gap: "10px",
              flexWrap: "wrap",
            }}
          >
            <span title="Prompt tokens">
              ↑ {message.promptStats.promptTokens}
            </span>
            <span title="Completion tokens">
              ↓ {message.promptStats.completionTokens}
            </span>
            <span title="Total tokens">
              Σ {message.promptStats.totalTokens}
            </span>
            <span title="Latency">
              {message.promptStats.latencyMs >= 1000
                ? `${(message.promptStats.latencyMs / 1000).toFixed(1)}s`
                : `${message.promptStats.latencyMs}ms`}
            </span>
          </div>
        )}

        {/* Timestamp */}
        <div
          style={{
            marginTop: "4px",
            fontSize: "11px",
            color: isUser ? "rgba(255,255,255,0.5)" : "#999",
            textAlign: "right",
          }}
        >
          {new Date(message.createdAt).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}
