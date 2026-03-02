/**
 * ConversationSidebar Component
 *
 * Shows list of conversations and allows creating new ones.
 */

import type { Conversation } from "../../hooks/useConversation";

interface ConversationSidebarProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  isCreating: boolean;
  isLoading: boolean;
}

export default function ConversationSidebar({
  conversations,
  activeConversationId,
  onSelect,
  onCreate,
  isCreating,
  isLoading,
}: ConversationSidebarProps) {
  return (
    <div
      style={{
        width: "260px",
        borderRight: "1px solid #e0e0e0",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#f8f8f8",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px",
          borderBottom: "1px solid #e0e0e0",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h3 style={{ margin: 0, fontSize: "14px", fontWeight: "600" }}>
          Conversations
        </h3>
        <button
          type="button"
          onClick={onCreate}
          disabled={isCreating}
          style={{
            padding: "4px 12px",
            borderRadius: "6px",
            border: "1px solid #0066cc",
            backgroundColor: isCreating ? "#ccc" : "#0066cc",
            color: "#fff",
            fontSize: "12px",
            cursor: isCreating ? "not-allowed" : "pointer",
          }}
        >
          {isCreating ? "..." : "+ New"}
        </button>
      </div>

      {/* Conversation list */}
      <div style={{ flex: 1, overflow: "auto", padding: "8px" }}>
        {isLoading ? (
          <div style={{ padding: "16px", color: "#999", textAlign: "center" }}>
            Loading...
          </div>
        ) : conversations.length === 0 ? (
          <div
            style={{
              padding: "16px",
              color: "#999",
              textAlign: "center",
              fontSize: "13px",
            }}
          >
            No conversations yet. Create one to start analyzing your data.
          </div>
        ) : (
          conversations.map((conv) => (
            <button
              key={conv.id}
              type="button"
              onClick={() => onSelect(conv.id)}
              style={{
                display: "block",
                width: "100%",
                padding: "10px 12px",
                marginBottom: "4px",
                borderRadius: "8px",
                border: "none",
                backgroundColor:
                  conv.id === activeConversationId ? "#e0ecff" : "transparent",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: conv.id === activeConversationId ? "600" : "400",
                  color: "#1a1a1a",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {conv.name || "New Conversation"}
              </div>
              <div
                style={{ fontSize: "11px", color: "#999", marginTop: "2px" }}
              >
                {conv.messageCount} messages •{" "}
                {new Date(conv.updatedAt).toLocaleDateString()}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
