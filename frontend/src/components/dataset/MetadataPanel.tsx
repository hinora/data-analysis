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
        <p style={{ color: "#ef4444", fontSize: 13 }}>
          Metadata generation failed. Use retry to regenerate.
        </p>
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
  const desc = (metadata as any).datasetDescription;
  const columns = ((metadata as any).columnDescriptions || []) as Array<{
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

const UnstructuredMetadataView: React.FC<{
  metadata: Record<string, unknown>;
}> = ({ metadata }) => {
  const m = metadata as any;

  return (
    <div>
      {m.documentSummary && (
        <p style={{ fontSize: 13, color: "#475569", marginBottom: 8 }}>
          {m.documentSummary}
        </p>
      )}

      {m.keyTopics?.length > 0 && (
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
