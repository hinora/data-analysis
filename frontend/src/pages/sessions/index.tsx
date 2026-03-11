/**
 * Sessions Dashboard Page
 *
 * Lists all sessions with a "New Session" button.
 * Entry point for the data analysis workflow.
 */

import { useRouter } from "next/router";
import type React from "react";
import { useState } from "react";
import { SessionList } from "@/components/session/SessionList";
import { useCreateSession, useListSessions } from "@/hooks/useSession";

const SessionsPage: React.FC = () => {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useListSessions(page);
  const createSession = useCreateSession();

  const handleCreate = async () => {
    try {
      const session = await createSession.mutateAsync({});
      router.push(`/sessions/${session.id}`);
    } catch (err) {
      console.error("Failed to create session:", err);
    }
  };

  const handleSessionClick = (id: string) => {
    router.push(`/sessions/${id}`);
  };

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: 24 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>
          Analysis Sessions
        </h1>
        <button
          type="button"
          onClick={handleCreate}
          disabled={createSession.isPending}
          style={{
            backgroundColor: "#3b82f6",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            padding: "8px 16px",
            fontSize: 14,
            fontWeight: 500,
            cursor: createSession.isPending ? "not-allowed" : "pointer",
            opacity: createSession.isPending ? 0.7 : 1,
          }}
        >
          {createSession.isPending ? "Creating..." : "+ New Session"}
        </button>
      </div>

      <SessionList
        sessions={data?.data ?? []}
        isLoading={isLoading}
        onSessionClick={handleSessionClick}
      />

      {data && data.totalPages > 1 && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 8,
            marginTop: 16,
          }}
        >
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            style={{
              padding: "4px 12px",
              cursor: page <= 1 ? "not-allowed" : "pointer",
            }}
          >
            Previous
          </button>
          <span style={{ padding: "4px 8px", color: "#64748b" }}>
            Page {page} of {data.totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
            disabled={page >= data.totalPages}
            style={{
              padding: "4px 12px",
              cursor: page >= data.totalPages ? "not-allowed" : "pointer",
            }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

export default SessionsPage;
