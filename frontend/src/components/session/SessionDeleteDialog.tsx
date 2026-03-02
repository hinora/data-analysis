/**
 * SessionDeleteDialog Component
 *
 * Confirmation dialog with warning about cascade deletion.
 */

interface SessionDeleteDialogProps {
  sessionName: string;
  datasetCount: number;
  conversationCount: number;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
}

export default function SessionDeleteDialog({
  sessionName,
  datasetCount,
  conversationCount,
  onConfirm,
  onCancel,
  isDeleting,
}: SessionDeleteDialogProps) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          backgroundColor: "#fff",
          borderRadius: 12,
          padding: 24,
          maxWidth: 420,
          width: "90%",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          style={{
            margin: "0 0 12px",
            fontSize: 18,
            fontWeight: 600,
            color: "#dc2626",
          }}
        >
          Delete Session
        </h3>
        <p style={{ margin: "0 0 12px", fontSize: 14, color: "#1a1a1a" }}>
          Are you sure you want to delete <strong>{sessionName}</strong>?
        </p>
        <div
          style={{
            backgroundColor: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 8,
            padding: 12,
            marginBottom: 16,
            fontSize: 13,
            color: "#991b1b",
          }}
        >
          <strong>This will permanently delete:</strong>
          <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>
            <li>
              {datasetCount} dataset{datasetCount !== 1 ? "s" : ""} and all
              their records
            </li>
            <li>
              {conversationCount} conversation
              {conversationCount !== 1 ? "s" : ""} and chat history
            </li>
            <li>All AI logs and metadata</li>
            <li>Uploaded files from disk</li>
          </ul>
          <p style={{ margin: "8px 0 0", fontWeight: 600 }}>
            This action cannot be undone.
          </p>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: "1px solid #e2e8f0",
              backgroundColor: "#fff",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: "none",
              backgroundColor: "#dc2626",
              color: "#fff",
              cursor: isDeleting ? "not-allowed" : "pointer",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {isDeleting ? "Deleting..." : "Delete Session"}
          </button>
        </div>
      </div>
    </div>
  );
}
