/**
 * ChatInput Component
 *
 * Text input with send button for chat messages.
 * Supports Enter to send, Shift+Enter for newline.
 */

import type React from "react";
import { useCallback, useRef, useState } from "react";

interface ChatInputProps {
  onSend: (content: string) => void;
  isLoading: boolean;
  disabled?: boolean;
}

export default function ChatInput({
  onSend,
  isLoading,
  disabled = false,
}: ChatInputProps) {
  const [content, setContent] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = content.trim();
    if (!trimmed || isLoading || disabled) return;
    onSend(trimmed);
    setContent("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [content, isLoading, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setContent(e.target.value);
      // Auto-resize textarea
      const el = e.target;
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    },
    [],
  );

  return (
    <div
      style={{
        display: "flex",
        gap: "8px",
        padding: "12px 16px",
        borderTop: "1px solid #e0e0e0",
        backgroundColor: "#fafafa",
        alignItems: "flex-end",
      }}
    >
      <textarea
        ref={textareaRef}
        value={content}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder={
          isLoading
            ? "AI is thinking..."
            : "Type your message... (Enter to send, Shift+Enter for newline)"
        }
        disabled={isLoading || disabled}
        rows={1}
        style={{
          flex: 1,
          padding: "10px 14px",
          borderRadius: "20px",
          border: "1px solid #ccc",
          resize: "none",
          fontSize: "14px",
          lineHeight: "1.4",
          fontFamily: "inherit",
          outline: "none",
          maxHeight: "200px",
          overflow: "auto",
          opacity: disabled ? 0.5 : 1,
        }}
      />
      <button
        type="button"
        onClick={handleSend}
        disabled={!content.trim() || isLoading || disabled}
        style={{
          padding: "10px 20px",
          borderRadius: "20px",
          border: "none",
          backgroundColor:
            !content.trim() || isLoading || disabled ? "#ccc" : "#0066cc",
          color: "#fff",
          fontSize: "14px",
          fontWeight: "600",
          cursor:
            !content.trim() || isLoading || disabled
              ? "not-allowed"
              : "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {isLoading ? "Thinking..." : "Send"}
      </button>
    </div>
  );
}
