/**
 * Session List Component
 *
 * Renders a list of session cards with loading and empty states.
 */

import type React from "react";
import type { Session } from "@/hooks/useSession";
import { SessionCard } from "./SessionCard";

interface SessionListProps {
  sessions: Session[];
  isLoading: boolean;
  onSessionClick: (id: string) => void;
}

export const SessionList: React.FC<SessionListProps> = ({
  sessions,
  isLoading,
  onSessionClick,
}) => {
  if (isLoading) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "#94a3b8" }}>
        Loading sessions...
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "#94a3b8" }}>
        <p>No sessions yet.</p>
        <p>Create a new session to get started with data analysis.</p>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {sessions.map((session) => (
        <SessionCard
          key={session.id}
          session={session}
          onClick={onSessionClick}
        />
      ))}
    </div>
  );
};
