/**
 * ThinkingIndicator Component
 *
 * Displays an animated "Thinking..." bubble in the chat,
 * styled like an assistant message with a pulsing dot animation.
 */

import { useEffect, useState } from "react";

export default function ThinkingIndicator() {
  const [dots, setDots] = useState(".");

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? "." : `${prev}.`));
    }, 500);
    return () => clearInterval(interval);
  }, []);

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
          padding: "12px 16px",
          borderRadius: "16px 16px 16px 4px",
          backgroundColor: "#f0f0f0",
          color: "#888",
          fontSize: "14px",
          lineHeight: "1.5",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            gap: "4px",
          }}
        >
          <span
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              backgroundColor: "#999",
              animation: "thinkingBounce 1.4s ease-in-out infinite",
              animationDelay: "0s",
            }}
          />
          <span
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              backgroundColor: "#999",
              animation: "thinkingBounce 1.4s ease-in-out infinite",
              animationDelay: "0.2s",
            }}
          />
          <span
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              backgroundColor: "#999",
              animation: "thinkingBounce 1.4s ease-in-out infinite",
              animationDelay: "0.4s",
            }}
          />
        </span>
        <span style={{ fontStyle: "italic" }}>Thinking{dots}</span>
      </div>

      <style jsx global>{`
        @keyframes thinkingBounce {
          0%, 80%, 100% {
            transform: scale(0.6);
            opacity: 0.4;
          }
          40% {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
