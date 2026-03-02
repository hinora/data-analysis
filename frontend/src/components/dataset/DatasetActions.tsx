/**
 * DatasetActions Component
 *
 * Rename and delete dataset with confirmation dialogs.
 */

import { useState } from "react";

interface DatasetActionsProps {
  datasetId: string;
  datasetName: string;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  isRenaming?: boolean;
  isDeleting?: boolean;
}

export default function DatasetActions({
  datasetId,
  datasetName,
  onRename,
  onDelete,
  isRenaming = false,
  isDeleting = false,
}: DatasetActionsProps) {
  const [showRename, setShowRename] = useState(false);
  const [newName, setNewName] = useState(datasetName);

  const handleRename = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    await onRename(datasetId, trimmed);
    setShowRename(false);
  };

  const handleDelete = async () => {
    if (
      !window.confirm(
        `Delete "${datasetName}"? This will permanently remove all records and metadata.`,
      )
    ) {
      return;
    }
    await onDelete(datasetId);
  };

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      {showRename ? (
        <div style={{ display: "flex", gap: 4 }}>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            style={{
              padding: "4px 8px",
              fontSize: 12,
              border: "1px solid #e2e8f0",
              borderRadius: 4,
              width: 180,
            }}
          />
          <button
            type="button"
            onClick={handleRename}
            disabled={isRenaming}
            style={{
              padding: "4px 8px",
              fontSize: 11,
              border: "none",
              borderRadius: 4,
              backgroundColor: "#0066cc",
              color: "#fff",
              cursor: isRenaming ? "not-allowed" : "pointer",
            }}
          >
            {isRenaming ? "..." : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setShowRename(false)}
            style={{
              padding: "4px 8px",
              fontSize: 11,
              border: "1px solid #e2e8f0",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => {
              setNewName(datasetName);
              setShowRename(true);
            }}
            style={{
              padding: "4px 10px",
              fontSize: 11,
              border: "1px solid #e2e8f0",
              borderRadius: 4,
              cursor: "pointer",
              backgroundColor: "#fff",
            }}
          >
            Rename
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            style={{
              padding: "4px 10px",
              fontSize: 11,
              border: "none",
              borderRadius: 4,
              backgroundColor: "#fee2e2",
              color: "#dc2626",
              cursor: isDeleting ? "not-allowed" : "pointer",
            }}
          >
            {isDeleting ? "..." : "Delete"}
          </button>
        </>
      )}
    </div>
  );
}
