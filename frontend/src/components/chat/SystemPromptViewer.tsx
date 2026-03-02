/**
 * SystemPromptViewer Component
 *
 * Expandable panel showing the system prompt used for a conversation.
 */

import { useState } from "react";

interface SystemPromptViewerProps {
  systemPrompt: string | null;
}

export default function SystemPromptViewer({
  systemPrompt,
}: SystemPromptViewerProps) {
  const [expanded, setExpanded] = useState(false);

  if (!systemPrompt) return null;

  return (
    <div
      style={{
        margin: "8px 16px",
        borderRadius: "8px",
        border: "1px solid #e0e0e0",
        backgroundColor: "#f9f9f9",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          width: "100%",
          padding: "8px 12px",
          border: "none",
          backgroundColor: "transparent",
          cursor: "pointer",
          fontSize: "12px",
          color: "#666",
        }}
      >
        <span>System Prompt</span>
        <span>{expanded ? "▼" : "▶"}</span>
      </button>
      {expanded && (
        <div
          style={{
            padding: "8px 12px",
            borderTop: "1px solid #e0e0e0",
            fontSize: "12px",
            lineHeight: "1.4",
            color: "#444",
            maxHeight: "300px",
            overflow: "auto",
            whiteSpace: "pre-wrap",
            fontFamily: "monospace",
          }}
        >
          {systemPrompt}
        </div>
      )}
    </div>
  );
}
