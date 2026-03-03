/**
 * DatasetPreview Component
 *
 * Tabular view with original + camelCase headers, detected types, and first N rows.
 */

interface ColumnInfo {
  original: string;
  camelCase: string;
  detectedType: string;
}

interface DatasetPreviewProps {
  columns: ColumnInfo[];
  rows: Record<string, unknown>[];
  datasetName: string;
  previewCount: number;
  totalRows: number;
}

export default function DatasetPreview({
  columns,
  rows,
  datasetName: _datasetName,
  previewCount,
  totalRows,
}: DatasetPreviewProps) {
  if (columns.length === 0 || rows.length === 0) {
    return (
      <div
        style={{
          padding: 16,
          color: "#94a3b8",
          fontSize: 13,
          textAlign: "center",
        }}
      >
        No preview data available.
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: "#64748b", marginBottom: 8 }}>
        Showing {previewCount} of {totalRows} rows
      </div>
      <div
        style={{
          overflow: "auto",
          maxHeight: 400,
          border: "1px solid #e2e8f0",
          borderRadius: 6,
        }}
      >
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 12,
          }}
        >
          <thead>
            <tr
              style={{ backgroundColor: "#f8fafc", position: "sticky", top: 0 }}
            >
              {columns.map((col) => (
                <th
                  key={col.camelCase}
                  style={{
                    padding: "8px 10px",
                    textAlign: "left",
                    borderBottom: "2px solid #e2e8f0",
                    whiteSpace: "nowrap",
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{col.original}</div>
                  {col.original !== col.camelCase && (
                    <div
                      style={{
                        fontWeight: 400,
                        color: "#94a3b8",
                        fontSize: 10,
                      }}
                    >
                      {col.camelCase}
                    </div>
                  )}
                  <div
                    style={{
                      fontSize: 10,
                      color: "#0066cc",
                      fontWeight: 400,
                      marginTop: 2,
                    }}
                  >
                    {col.detectedType}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => {
              const rowKey =
                columns.length > 0
                  ? `row-${String(row[columns[0].camelCase] ?? rowIdx)}`
                  : `row-${rowIdx}`;
              return (
                <tr
                  key={rowKey}
                  style={{
                    backgroundColor: rowIdx % 2 === 0 ? "#fff" : "#f8fafc",
                  }}
                >
                  {columns.map((col) => (
                    <td
                      key={col.camelCase}
                      style={{
                        padding: "6px 10px",
                        borderBottom: "1px solid #f1f5f9",
                        maxWidth: 200,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {row[col.camelCase] != null
                        ? String(row[col.camelCase])
                        : "—"}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
