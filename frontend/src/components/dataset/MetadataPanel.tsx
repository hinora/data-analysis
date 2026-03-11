/**
 * MetadataPanel Component
 *
 * Displays structured metadata (column descriptions, statistics)
 * and unstructured metadata (topics, summary, entities) with status indicators.
 */

import type React from "react";

interface MetadataPanelProps {
  metadataStatus: string;
  structuredMetadata?: Record<string, unknown> | null;
  unstructuredMetadata?: Record<string, unknown> | null;
  relationships?: unknown[] | null;
  onRetry?: () => void;
  isRetrying?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "#94a3b8",
  "in-progress": "#f59e0b",
  ready: "#22c55e",
  failed: "#ef4444",
};

export const MetadataPanel: React.FC<MetadataPanelProps> = ({
  metadataStatus,
  structuredMetadata,
  unstructuredMetadata,
  onRetry,
  isRetrying,
}) => {
  const statusColor = STATUS_COLORS[metadataStatus] || "#94a3b8";

  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
          AI Metadata
        </h3>
        <span
          style={{
            backgroundColor: statusColor,
            color: "#fff",
            padding: "2px 8px",
            borderRadius: 12,
            fontSize: 11,
            fontWeight: 500,
          }}
        >
          {metadataStatus}
        </span>
      </div>

      {metadataStatus === "pending" && (
        <p style={{ color: "#94a3b8", fontSize: 13 }}>
          Metadata generation is queued...
        </p>
      )}

      {metadataStatus === "in-progress" && (
        <p style={{ color: "#f59e0b", fontSize: 13 }}>
          AI is analysing this dataset...
        </p>
      )}

      {metadataStatus === "failed" && (
        <div>
          <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 8 }}>
            Metadata generation failed.
          </p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              disabled={isRetrying}
              style={{
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: 500,
                border: "none",
                borderRadius: 6,
                backgroundColor: isRetrying ? "#fca5a5" : "#ef4444",
                color: "#fff",
                cursor: isRetrying ? "not-allowed" : "pointer",
              }}
            >
              {isRetrying ? "Retrying..." : "Retry Generate Metadata"}
            </button>
          )}
        </div>
      )}

      {metadataStatus === "ready" && structuredMetadata && (
        <StructuredMetadataView metadata={structuredMetadata} />
      )}

      {metadataStatus === "ready" && unstructuredMetadata && (
        <UnstructuredMetadataView metadata={unstructuredMetadata} />
      )}
    </div>
  );
};

const StructuredMetadataView: React.FC<{
  metadata: Record<string, unknown>;
}> = ({ metadata }) => {
  const desc = metadata.datasetDescription as string | undefined;
  const columns = (metadata.columnDescriptions || []) as Array<{
    columnKey: string;
    columnOriginal: string;
    description: string;
    exampleValues: string[];
  }>;

  return (
    <div>
      {desc && (
        <p style={{ fontSize: 13, color: "#475569", marginBottom: 8 }}>
          {desc}
        </p>
      )}
      {columns.length > 0 && (
        <div>
          <h4 style={{ fontSize: 13, fontWeight: 600, margin: "8px 0 4px" }}>
            Columns
          </h4>
          {columns.map((col) => (
            <div
              key={col.columnKey}
              style={{
                fontSize: 12,
                padding: "4px 0",
                borderBottom: "1px solid #f1f5f9",
              }}
            >
              <strong>{col.columnOriginal}</strong>
              <span style={{ color: "#94a3b8" }}> ({col.columnKey})</span>
              <div style={{ color: "#64748b" }}>{col.description}</div>
              {col.exampleValues?.length > 0 && (
                <div style={{ color: "#94a3b8", fontSize: 11 }}>
                  e.g. {col.exampleValues.slice(0, 3).join(", ")}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

interface UnstructuredMetadataShape {
  chunkCount?: number;
  contentDomain?: string;
  documentIndex?: Array<{
    chunkEnd: number;
    chunkStart: number;
    indexLabel: string;
    level: number;
    summary: string;
    title: string;
  }>;
  documentSummary?: string;
  entities?: Array<{ count: number; name: string; type: string }>;
  keyTopics?: string[];
  wordCount?: number;
}

const UnstructuredMetadataView: React.FC<{
  metadata: Record<string, unknown>;
}> = ({ metadata }) => {
  const m = metadata as UnstructuredMetadataShape;

  return (
    <div>
      {m.documentSummary && (
        <p style={{ fontSize: 13, color: "#475569", marginBottom: 8 }}>
          {m.documentSummary}
        </p>
      )}

      {m.keyTopics && m.keyTopics.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <h4 style={{ fontSize: 13, fontWeight: 600, margin: "0 0 4px" }}>
            Key Topics
          </h4>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {m.keyTopics.map((topic: string) => (
              <span
                key={topic}
                style={{
                  backgroundColor: "#f1f5f9",
                  padding: "2px 6px",
                  borderRadius: 4,
                  fontSize: 11,
                }}
              >
                {topic}
              </span>
            ))}
          </div>
        </div>
      )}

      {m.documentIndex && m.documentIndex.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <h4 style={{ fontSize: 13, fontWeight: 600, margin: "0 0 4px" }}>
            Document Index
          </h4>
          <div style={{ fontSize: 12 }}>
            {m.documentIndex.map((entry) => (
              <div
                key={`${entry.indexLabel}-${entry.chunkStart}`}
                style={{
                  padding: "2px 0",
                  paddingLeft: (entry.level || 0) * 16,
                }}
              >
                <span style={{ color: "#3b82f6", fontWeight: 500 }}>
                  {entry.indexLabel}.
                </span>{" "}
                <span style={{ fontWeight: entry.level === 0 ? 600 : 400 }}>
                  {entry.title}
                </span>
                <span style={{ color: "#94a3b8", fontSize: 11 }}>
                  {" "}
                  [chunks {entry.chunkStart}–{entry.chunkEnd}]
                </span>
                {entry.summary && (
                  <div style={{ color: "#64748b", fontSize: 11 }}>
                    {entry.summary}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {m.contentDomain && (
        <div style={{ fontSize: 12, color: "#64748b" }}>
          Domain: {m.contentDomain} · {m.wordCount?.toLocaleString() ?? "?"}{" "}
          words · {m.chunkCount ?? "?"} chunks
        </div>
      )}

      {m.entities?.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <h4 style={{ fontSize: 13, fontWeight: 600, margin: "0 0 4px" }}>
            Entities
          </h4>
          {m.entities
            .slice(0, 10)
            .map((ent: { name: string; type: string; count: number }) => (
              <span
                key={`${ent.name}-${ent.type}`}
                style={{
                  display: "inline-block",
                  backgroundColor: "#eff6ff",
                  padding: "2px 6px",
                  borderRadius: 4,
                  fontSize: 11,
                  marginRight: 4,
                  marginBottom: 4,
                }}
              >
                {ent.name} ({ent.type})
              </span>
            ))}
        </div>
      )}
    </div>
  );
};
