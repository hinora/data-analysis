/**
 * ReasoningPanel Component
 *
 * Collapsible panel that displays AI reasoning steps and tool usage
 * for a completed assistant message. Provides a "Thought process" header
 * similar to how streaming reasoning is shown during live responses.
 */

import { useState } from "react";
import type { CitedSource, ToolUsage } from "../../hooks/useChat";

interface ReasoningPanelProps {
  citedSources: CitedSource[] | null;
  reasoningSteps: string[] | null;
  toolsUsed: ToolUsage[] | null;
}

/** Classify a reasoning step as either an AI thinking line or an internal log. */
function isInternalStep(step: string): boolean {
  return (
    /^Iteration \d+:/i.test(step) ||
    /^Calling tool:/i.test(step) ||
    /^Tool .+ returned/i.test(step) ||
    /^Tool .+ failed:/i.test(step) ||
    /^Unknown tool:/i.test(step) ||
    /^Empty response/i.test(step) ||
    /^Error:/i.test(step)
  );
}

export default function ReasoningPanel({
  citedSources,
  reasoningSteps,
  toolsUsed,
}: ReasoningPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [showInternalSteps, setShowInternalSteps] = useState(false);

  const hasContent =
    (reasoningSteps && reasoningSteps.length > 0) ||
    (toolsUsed && toolsUsed.length > 0);

  if (!hasContent) return null;

  // Separate AI reasoning from internal/debug steps
  const aiReasoning = reasoningSteps?.filter((s) => !isInternalStep(s)) ?? [];
  const internalSteps = reasoningSteps?.filter((s) => isInternalStep(s)) ?? [];

  const toolCount = toolsUsed?.length ?? 0;
  const reasoningCount = aiReasoning.length;

  // Build summary text for the toggle button
  const summaryParts: string[] = [];
  if (reasoningCount > 0)
    summaryParts.push(
      `${reasoningCount} reasoning step${reasoningCount !== 1 ? "s" : ""}`,
    );
  if (toolCount > 0)
    summaryParts.push(`${toolCount} tool${toolCount !== 1 ? "s" : ""} used`);

  return (
    <div
      style={{
        marginTop: "10px",
        borderRadius: "8px",
        border: "1px solid #e2e2e2",
        overflow: "hidden",
        backgroundColor: "#fafafa",
      }}
    >
      {/* Toggle header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px 12px",
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: "13px",
          color: "#555",
          textAlign: "left",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "20px",
            height: "20px",
            borderRadius: "50%",
            backgroundColor: "#e8f0fe",
            color: "#1a73e8",
            fontSize: "11px",
            flexShrink: 0,
          }}
        >
          💭
        </span>
        <span style={{ flex: 1 }}>
          <span style={{ fontWeight: 600, color: "#333" }}>
            Thought process
          </span>
          {summaryParts.length > 0 && (
            <span style={{ color: "#888", marginLeft: "6px" }}>
              — {summaryParts.join(", ")}
            </span>
          )}
        </span>
        <span
          style={{
            fontSize: "11px",
            color: "#999",
            transition: "transform 0.2s",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
          }}
        >
          ▼
        </span>
      </button>

      {/* Expandable content */}
      {expanded && (
        <div
          style={{
            padding: "0 12px 12px",
            maxHeight: "400px",
            overflowY: "auto",
          }}
        >
          {/* AI reasoning steps */}
          {aiReasoning.length > 0 && (
            <div style={{ marginBottom: toolCount > 0 ? "12px" : 0 }}>
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "#888",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  marginBottom: "6px",
                }}
              >
                Reasoning
              </div>
              <div
                style={{
                  borderLeft: "3px solid #c8d6e5",
                  paddingLeft: "10px",
                }}
              >
                {aiReasoning.map((step) => (
                  <div
                    key={`reason-${step.slice(0, 80)}`}
                    style={{
                      padding: "3px 0",
                      fontSize: "13px",
                      color: "#444",
                      lineHeight: "1.5",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {step}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tool calls */}
          {toolsUsed && toolsUsed.length > 0 && (
            <div
              style={{ marginBottom: internalSteps.length > 0 ? "12px" : 0 }}
            >
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "#888",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  marginBottom: "6px",
                }}
              >
                Tools Used
              </div>
              <div
                style={{ display: "flex", flexDirection: "column", gap: "6px" }}
              >
                {toolsUsed.map((tool, index) => (
                  <ToolCallCard
                    key={`tool-${tool.toolName}-${index}`}
                    tool={tool}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Internal steps (collapsed by default) */}
          {internalSteps.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowInternalSteps(!showInternalSteps)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#999",
                  cursor: "pointer",
                  fontSize: "11px",
                  padding: 0,
                }}
              >
                {showInternalSteps ? "▾ Hide" : "▸ Show"} internal steps (
                {internalSteps.length})
              </button>
              {showInternalSteps && (
                <div
                  style={{
                    marginTop: "4px",
                    paddingLeft: "10px",
                    borderLeft: "2px solid #e8e8e8",
                  }}
                >
                  {internalSteps.map((step) => (
                    <div
                      key={`internal-${step.slice(0, 80)}`}
                      style={{
                        padding: "1px 0",
                        fontSize: "11px",
                        color: "#aaa",
                        fontFamily: "monospace",
                      }}
                    >
                      {step}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Cited sources */}
          {citedSources && citedSources.length > 0 && (
            <div style={{ marginTop: "10px" }}>
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "#888",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  marginBottom: "6px",
                }}
              >
                Sources
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                {citedSources.map((source) => (
                  <span
                    key={`${source.datasetName}-${source.columnName || ""}`}
                    style={{
                      display: "inline-block",
                      padding: "3px 10px",
                      borderRadius: "12px",
                      backgroundColor: "#e8f0fe",
                      color: "#1a73e8",
                      fontSize: "11px",
                      fontWeight: 500,
                    }}
                  >
                    {source.datasetName}
                    {source.columnName ? ` → ${source.columnName}` : ""}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-component ───────────────────────────────────────────────────────

function ToolCallCard({ tool }: { tool: ToolUsage }) {
  const [showResult, setShowResult] = useState(false);

  return (
    <div
      style={{
        padding: "8px 10px",
        borderRadius: "6px",
        backgroundColor: "#f0f4f8",
        border: "1px solid #e2e8f0",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "12px",
        }}
      >
        <span style={{ color: "#38a169", fontWeight: "bold" }}>✓</span>
        <span style={{ fontWeight: 600, color: "#2d3748" }}>
          {tool.toolName}
        </span>
        {Object.keys(tool.parameters).length > 0 && (
          <span
            style={{
              color: "#718096",
              fontSize: "11px",
              fontFamily: "monospace",
            }}
          >
            (
            {Object.entries(tool.parameters)
              .map(([k, v]) => `${k}: ${typeof v === "string" ? `"${v}"` : v}`)
              .join(", ")}
            )
          </span>
        )}
      </div>

      {tool.resultSummary && (
        <>
          <button
            type="button"
            onClick={() => setShowResult(!showResult)}
            style={{
              background: "none",
              border: "none",
              color: "#718096",
              cursor: "pointer",
              fontSize: "11px",
              marginTop: "4px",
              padding: 0,
            }}
          >
            {showResult ? "Hide result" : "Show result"}
          </button>
          {showResult && (
            <div
              style={{
                marginTop: "4px",
                padding: "6px 8px",
                borderRadius: "4px",
                backgroundColor: "#fff",
                border: "1px solid #e2e8f0",
                fontSize: "11px",
                fontFamily: "monospace",
                color: "#4a5568",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                maxHeight: "150px",
                overflowY: "auto",
              }}
            >
              {tool.resultSummary.length > 500
                ? `${tool.resultSummary.slice(0, 500)}…`
                : tool.resultSummary}
            </div>
          )}
        </>
      )}
    </div>
  );
}
