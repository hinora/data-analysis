/**
 * StreamingThinkingIndicator Component
 *
 * Displays real-time AI reasoning progress during streaming:
 * status messages, reasoning steps, tool call activity, and streamed content.
 */

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ActiveTool, StreamingState } from "../../hooks/useStreamChat";

interface StreamingThinkingIndicatorProps {
  state: StreamingState;
}

export default function StreamingThinkingIndicator({
  state,
}: StreamingThinkingIndicatorProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the bottom as new events arrive
  const eventCount =
    state.reasoningSteps.length + state.tools.length + (state.content ? 1 : 0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: eventCount drives scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [eventCount]);

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "flex-start",
        marginBottom: "12px",
        paddingRight: "48px",
      }}
    >
      <div
        style={{
          maxWidth: "85%",
          width: "100%",
          padding: "12px 16px",
          borderRadius: "16px 16px 16px 4px",
          backgroundColor: "#f0f0f0",
          color: "#1a1a1a",
          fontSize: "14px",
          lineHeight: "1.5",
        }}
      >
        {/* Status / live reasoning */}
        <ReasoningHeader
          reasoningSteps={state.reasoningSteps}
          statusMessage={state.statusMessage}
        />

        {/* Reasoning steps & tool activity */}
        {(state.reasoningSteps.length > 0 || state.tools.length > 0) && (
          <ActivityLog
            reasoningSteps={state.reasoningSteps}
            tools={state.tools}
          />
        )}

        {/* Streamed content */}
        {state.content && (
          <div
            style={{
              marginTop: "8px",
              paddingTop: "8px",
              borderTop: "1px solid #ddd",
            }}
            className="markdown-assistant"
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {state.content}
            </ReactMarkdown>
          </div>
        )}

        {/* Error */}
        {state.error && (
          <div
            style={{
              marginTop: "8px",
              padding: "8px",
              borderRadius: "6px",
              backgroundColor: "#fde8e8",
              color: "#c53030",
              fontSize: "13px",
            }}
          >
            {state.error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <style jsx global>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────

function ReasoningHeader({
  reasoningSteps,
  statusMessage,
}: {
  reasoningSteps: string[];
  statusMessage: string;
}) {
  const [dots, setDots] = useState(".");

  useEffect(() => {
    const id = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? "." : `${prev}.`));
    }, 500);
    return () => clearInterval(id);
  }, []);

  // Show the latest reasoning step if available, otherwise fall back to status
  const latestReasoning =
    reasoningSteps.length > 0
      ? reasoningSteps[reasoningSteps.length - 1]
      : null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "8px",
        marginBottom: "8px",
        color: "#666",
        fontSize: "13px",
      }}
    >
      {/* Animated spinner */}
      <span
        style={{
          display: "inline-block",
          width: "14px",
          height: "14px",
          border: "2px solid #ccc",
          borderTopColor: "#0066cc",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
          flexShrink: 0,
          marginTop: "2px",
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        {latestReasoning ? (
          <>
            <div
              style={{
                fontStyle: "italic",
                color: "#555",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                lineHeight: "1.4",
              }}
            >
              {latestReasoning}
            </div>
            {statusMessage && (
              <div
                style={{ fontSize: "11px", color: "#999", marginTop: "2px" }}
              >
                {statusMessage}
                {dots}
              </div>
            )}
          </>
        ) : (
          <span style={{ fontStyle: "italic" }}>
            {statusMessage || "Thinking"}
            {dots}
          </span>
        )}
      </div>
    </div>
  );
}

function ActivityLog({
  reasoningSteps,
  tools,
}: {
  reasoningSteps: string[];
  tools: ActiveTool[];
}) {
  const [expanded, setExpanded] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll the activity log to the bottom when new items arrive
  const itemCount = reasoningSteps.length + tools.length;
  // biome-ignore lint/correctness/useExhaustiveDependencies: itemCount drives scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [itemCount]);

  return (
    <div
      style={{
        fontSize: "12px",
        color: "#555",
        borderLeft: "3px solid #0066cc",
        paddingLeft: "10px",
        marginTop: "4px",
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        style={{
          background: "none",
          border: "none",
          color: "#0066cc",
          cursor: "pointer",
          fontSize: "12px",
          padding: 0,
          marginBottom: "4px",
        }}
      >
        {expanded ? "▾ Hide activity" : "▸ Show activity"} (
        {reasoningSteps.length} steps, {tools.length} tools)
      </button>

      {expanded && (
        <div ref={scrollRef} style={{ maxHeight: "200px", overflowY: "auto" }}>
          {reasoningSteps.map((step, index) => (
            <div
              key={`step-${step.slice(0, 20)}-${index}`}
              style={{
                padding: "2px 0",
                color: "#777",
                fontSize: "11px",
                fontFamily: "monospace",
              }}
            >
              {step}
            </div>
          ))}

          {tools.map((tool) => (
            <ToolCallItem
              key={`tool-${tool.toolName}-${tool.status}`}
              tool={tool}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ToolCallItem({ tool }: { tool: ActiveTool }) {
  const statusColor =
    tool.status === "running"
      ? "#e69500"
      : tool.status === "success"
        ? "#38a169"
        : "#e53e3e";

  const statusIcon =
    tool.status === "running" ? "⏳" : tool.status === "success" ? "✓" : "✗";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "6px",
        padding: "4px 0",
        fontSize: "12px",
      }}
    >
      <span style={{ color: statusColor, fontWeight: "bold", flexShrink: 0 }}>
        {statusIcon}
      </span>
      <div style={{ flex: 1 }}>
        <span style={{ fontWeight: 600 }}>{tool.toolName}</span>
        {tool.durationMs != null && (
          <span style={{ color: "#999", marginLeft: "6px" }}>
            {tool.durationMs}ms
          </span>
        )}
        {tool.resultPreview && (
          <div
            style={{
              color: "#888",
              fontSize: "11px",
              fontFamily: "monospace",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              maxHeight: "60px",
              overflow: "hidden",
              marginTop: "2px",
            }}
          >
            {tool.resultPreview}
          </div>
        )}
      </div>
    </div>
  );
}
