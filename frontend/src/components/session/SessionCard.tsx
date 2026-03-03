/**
 * Session Card Component
 *
 * Displays a single session summary with name, status badge,
 * dataset/conversation counts, and last activity.
 */

import type React from "react";
import type { Session } from "@/hooks/useSession";

interface SessionCardProps {
  session: Session;
  onClick: (id: string) => void;
}

const STATUS_LABELS: Record<Session["status"], string> = {
  empty: "Empty",
  "has-data": "Has Data",
  active: "Active",
  archived: "Archived",
};

const STATUS_COLORS: Record<Session["status"], string> = {
  empty: "#94a3b8",
  "has-data": "#3b82f6",
  active: "#22c55e",
  archived: "#a78bfa",
};

export const SessionCard: React.FC<SessionCardProps> = ({
  session,
  onClick,
}) => {
  const updatedAt = new Date(session.updatedAt).toLocaleString();

  return (
    <button
      type="button"
      onClick={() => onClick(session.id)}
      style={{
        border: "1px solid #e2e8f0",
        borderRadius: 8,
        padding: 16,
        cursor: "pointer",
        transition: "box-shadow 0.15s",
        width: "100%",
        textAlign: "left",
        background: "none",
        font: "inherit",
        color: "inherit",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
          {session.name}
        </h3>
        <span
          style={{
            backgroundColor: STATUS_COLORS[session.status],
            color: "#fff",
            padding: "2px 8px",
            borderRadius: 12,
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          {STATUS_LABELS[session.status]}
        </span>
      </div>

      <div style={{ marginTop: 8, fontSize: 13, color: "#64748b" }}>
        <span>
          {session.datasetCount} dataset{session.datasetCount !== 1 ? "s" : ""}
        </span>
        <span style={{ margin: "0 8px" }}>·</span>
        <span>
          {session.conversationCount} conversation
          {session.conversationCount !== 1 ? "s" : ""}
        </span>
      </div>

      <div style={{ marginTop: 4, fontSize: 12, color: "#94a3b8" }}>
        Last activity: {updatedAt}
      </div>
    </button>
  );
};
