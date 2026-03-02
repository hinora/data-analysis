/**
 * ChatMessageBubble Component
 *
 * Renders a single chat message with role-specific styling,
 * confidence indicator, cited sources, and tool usage details.
 */

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage } from "../../hooks/useChat";

interface ChatMessageBubbleProps {
  message: ChatMessage;
}

export default function ChatMessageBubble({ message }: ChatMessageBubbleProps) {
  const [showDetails, setShowDetails] = useState(false);
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";

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
        {/* Message content */}
        <div className={isUser ? "markdown-user" : "markdown-assistant"}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.content}
          </ReactMarkdown>
        </div>

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

        {/* Cited sources */}
        {isAssistant &&
          message.citedSources &&
          message.citedSources.length > 0 && (
            <div
              style={{
                marginTop: "8px",
                paddingTop: "8px",
                borderTop: `1px solid ${isUser ? "rgba(255,255,255,0.2)" : "#ddd"}`,
                fontSize: "12px",
              }}
            >
              <strong>Sources:</strong>
              {message.citedSources.map((source, i) => (
                <span
                  key={i}
                  style={{
                    display: "inline-block",
                    margin: "2px 4px",
                    padding: "2px 8px",
                    borderRadius: "12px",
                    backgroundColor: isUser
                      ? "rgba(255,255,255,0.15)"
                      : "#e0e0e0",
                    fontSize: "11px",
                  }}
                >
                  {source.datasetName}
                  {source.columnName ? ` (${source.columnName})` : ""}
                </span>
              ))}
            </div>
          )}

        {/* Tools used & reasoning toggle */}
        {isAssistant &&
          (message.toolsUsed?.length || message.reasoningSteps?.length) && (
            <div style={{ marginTop: "8px" }}>
              <button
                type="button"
                onClick={() => setShowDetails(!showDetails)}
                style={{
                  background: "none",
                  border: "none",
                  color: isUser ? "rgba(255,255,255,0.7)" : "#0066cc",
                  cursor: "pointer",
                  fontSize: "12px",
                  padding: 0,
                  textDecoration: "underline",
                }}
              >
                {showDetails ? "Hide details" : "Show details"}
                {message.toolsUsed?.length
                  ? ` (${message.toolsUsed.length} tools used)`
                  : ""}
              </button>

              {showDetails && (
                <div
                  style={{
                    marginTop: "8px",
                    padding: "8px",
                    borderRadius: "8px",
                    backgroundColor: isUser
                      ? "rgba(0,0,0,0.1)"
                      : "rgba(0,0,0,0.03)",
                    fontSize: "12px",
                  }}
                >
                  {message.toolsUsed?.map((tool, i) => (
                    <div key={i} style={{ marginBottom: "4px" }}>
                      <strong>{tool.toolName}</strong>:{" "}
                      {tool.resultSummary?.slice(0, 100)}
                      {(tool.resultSummary?.length || 0) > 100 ? "..." : ""}
                    </div>
                  ))}
                  {message.reasoningSteps?.map((step, i) => (
                    <div
                      key={`r-${i}`}
                      style={{
                        color: isUser ? "rgba(255,255,255,0.6)" : "#888",
                      }}
                    >
                      {step}
                    </div>
                  ))}
                </div>
              )}
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
