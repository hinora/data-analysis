/**
 * ChatMessageBubble Component
 *
 * Renders a single chat message with role-specific styling,
 * confidence indicator, cited sources, and tool usage details.
 */

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage } from "../../hooks/useChat";
import ReasoningPanel from "./ReasoningPanel";

interface ChatMessageBubbleProps {
  message: ChatMessage;
}

export default function ChatMessageBubble({ message }: ChatMessageBubbleProps) {
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

        {/* Reasoning panel (reasoning steps, tools, cited sources) */}
        {isAssistant && (
          <ReasoningPanel
            citedSources={message.citedSources}
            reasoningSteps={message.reasoningSteps}
            toolsUsed={message.toolsUsed}
          />
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
