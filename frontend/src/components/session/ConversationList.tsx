/**
 * ConversationList Component
 *
 * Lists conversations with name, message count, dates, and management actions.
 */

import { useState } from "react";
import type { Conversation } from "../../hooks/useConversation";

interface ConversationListProps {
  conversations: Conversation[];
  onSelect: (id: string) => void;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  isRenaming?: boolean;
  isDeleting?: boolean;
}

export default function ConversationList({
  conversations,
  onSelect,
  onRename,
  onDelete,
  isRenaming = false,
  isDeleting = false,
}: ConversationListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  if (conversations.length === 0) {
    return (
      <div
        style={{
          padding: 16,
          textAlign: "center",
          color: "#94a3b8",
          fontSize: 13,
        }}
      >
        No conversations yet.
      </div>
    );
  }

  return (
    <div>
      {conversations.map((conv) => (
        <div
          key={conv.id}
          style={{
            padding: "10px 12px",
            marginBottom: 4,
            borderRadius: 6,
            border: "1px solid #e2e8f0",
            backgroundColor: "#fff",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            {editingId === conv.id ? (
              <div style={{ display: "flex", gap: 4, flex: 1, marginRight: 8 }}>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  style={{
                    flex: 1,
                    padding: "2px 6px",
                    fontSize: 12,
                    border: "1px solid #e2e8f0",
                    borderRadius: 3,
                  }}
                />
                <button
                  type="button"
                  onClick={async () => {
                    await onRename(conv.id, editName);
                    setEditingId(null);
                  }}
                  disabled={isRenaming}
                  style={{
                    fontSize: 11,
                    padding: "2px 6px",
                    cursor: "pointer",
                  }}
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  style={{
                    fontSize: 11,
                    padding: "2px 6px",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onSelect(conv.id)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 500,
                  fontSize: 13,
                  textAlign: "left",
                  flex: 1,
                  padding: 0,
                  color: "#0066cc",
                }}
              >
                {conv.name || "New Conversation"}
              </button>
            )}
            {editingId !== conv.id && (
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(conv.id);
                    setEditName(conv.name || "");
                  }}
                  style={{
                    fontSize: 10,
                    padding: "2px 6px",
                    border: "1px solid #e2e8f0",
                    borderRadius: 3,
                    backgroundColor: "#fff",
                    cursor: "pointer",
                  }}
                >
                  Rename
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (
                      window.confirm(
                        `Delete "${conv.name || "this conversation"}"?`,
                      )
                    ) {
                      await onDelete(conv.id);
                    }
                  }}
                  disabled={isDeleting}
                  style={{
                    fontSize: 10,
                    padding: "2px 6px",
                    border: "none",
                    borderRadius: 3,
                    backgroundColor: "#fee2e2",
                    color: "#dc2626",
                    cursor: isDeleting ? "not-allowed" : "pointer",
                  }}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
            {conv.messageCount} messages · Created{" "}
            {new Date(conv.createdAt).toLocaleDateString()}
            {conv.updatedAt !== conv.createdAt &&
              ` · Last activity ${new Date(conv.updatedAt).toLocaleDateString()}`}
          </div>
        </div>
      ))}
    </div>
  );
}
