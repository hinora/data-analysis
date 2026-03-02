/**
 * DatasetList Component
 *
 * Displays datasets with name, file type, row/column count, import date, metadata status.
 */

interface DatasetItem {
  id: string;
  name: string;
  fileType: string;
  datasetType: string;
  rowCount: number;
  columnCount: number;
  metadataStatus: string;
  createdAt: string;
}

interface DatasetListProps {
  datasets: DatasetItem[];
  onSelect: (id: string) => void;
  selectedId?: string;
}

const statusColors: Record<string, string> = {
  ready: "#16a34a",
  "in-progress": "#ca8a04",
  pending: "#94a3b8",
  failed: "#dc2626",
};

export default function DatasetList({
  datasets,
  onSelect,
  selectedId,
}: DatasetListProps) {
  if (datasets.length === 0) {
    return (
      <div
        style={{
          padding: 16,
          textAlign: "center",
          color: "#94a3b8",
          fontSize: 13,
        }}
      >
        No datasets yet. Upload a file to get started.
      </div>
    );
  }

  return (
    <div>
      {datasets.map((ds) => (
        <button
          key={ds.id}
          type="button"
          onClick={() => onSelect(ds.id)}
          style={{
            display: "block",
            width: "100%",
            padding: "10px 12px",
            marginBottom: 4,
            borderRadius: 6,
            border:
              ds.id === selectedId ? "2px solid #0066cc" : "1px solid #e2e8f0",
            backgroundColor: ds.id === selectedId ? "#f0f7ff" : "#fff",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontWeight: 500, fontSize: 13 }}>{ds.name}</span>
            <span
              style={{
                fontSize: 11,
                padding: "2px 6px",
                borderRadius: 4,
                backgroundColor: `${statusColors[ds.metadataStatus] || "#94a3b8"}20`,
                color: statusColors[ds.metadataStatus] || "#94a3b8",
              }}
            >
              {ds.metadataStatus}
            </span>
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
            {ds.fileType.toUpperCase()} · {ds.datasetType} · {ds.rowCount} rows
            {ds.columnCount ? ` · ${ds.columnCount} cols` : ""}
            {" · "}
            {new Date(ds.createdAt).toLocaleDateString()}
          </div>
        </button>
      ))}
    </div>
  );
}
