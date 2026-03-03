/**
 * DatasetDetailModal Component
 *
 * Popup modal that displays dataset preview, metadata, and actions
 * for a selected dataset.
 */

import type React from "react";
import { useEffect } from "react";
import DatasetActions from "@/components/dataset/DatasetActions";
import DatasetPreview from "@/components/dataset/DatasetPreview";
import { MetadataPanel } from "@/components/dataset/MetadataPanel";
import type { Dataset } from "@/hooks/useDataset";
import { usePreviewDataset, useRetryMetadata } from "@/hooks/useDataset";

interface DatasetDetailModalProps {
  dataset: Dataset;
  onClose: () => void;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  isRenaming?: boolean;
  isDeleting?: boolean;
}

const DatasetDetailModal: React.FC<DatasetDetailModalProps> = ({
  dataset,
  onClose,
  onRename,
  onDelete,
  isRenaming,
  isDeleting,
}) => {
  const { data: previewData } = usePreviewDataset(dataset.id);
  const { mutate: retryMetadata, isPending: isRetrying } = useRetryMetadata();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      role="dialog"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0, 0, 0, 0.5)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        style={{
          backgroundColor: "#fff",
          borderRadius: 12,
          width: "90vw",
          maxWidth: 960,
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px 20px",
            borderBottom: "1px solid #e2e8f0",
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
              {dataset.name}
            </h2>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
              {dataset.fileType.toUpperCase()} · {dataset.rowCount} rows
              {dataset.columnCount ? ` · ${dataset.columnCount} columns` : ""}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <DatasetActions
              datasetId={dataset.id}
              datasetName={dataset.name}
              onRename={onRename}
              onDelete={onDelete}
              isRenaming={isRenaming}
              isDeleting={isDeleting}
            />
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "4px 10px",
                border: "1px solid #e2e8f0",
                borderRadius: 6,
                background: "none",
                fontSize: 18,
                cursor: "pointer",
                lineHeight: 1,
                color: "#64748b",
              }}
              title="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div
          style={{
            padding: 20,
            overflowY: "auto",
            flex: 1,
          }}
        >
          {/* Preview table */}
          {previewData && (
            <DatasetPreview
              columns={previewData.columns || []}
              rows={previewData.rows || []}
              datasetName={dataset.name}
              previewCount={
                previewData.previewCount || previewData.rows?.length || 0
              }
              totalRows={dataset.rowCount}
            />
          )}

          {/* Metadata */}
          {(dataset.structuredMetadata ||
            dataset.unstructuredMetadata ||
            dataset.metadataStatus === "failed") && (
            <div style={{ marginTop: 16 }}>
              <MetadataPanel
                metadataStatus={dataset.metadataStatus}
                structuredMetadata={dataset.structuredMetadata}
                unstructuredMetadata={dataset.unstructuredMetadata}
                relationships={dataset.relationships}
                onRetry={() => retryMetadata(dataset.id)}
                isRetrying={isRetrying}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DatasetDetailModal;
