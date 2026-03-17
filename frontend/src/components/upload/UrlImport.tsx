/**
 * UrlImport Component
 *
 * Allows the user to enter a URL and import its content as an
 * unstructured-text dataset. Shows loading, success, and error states.
 */

import type React from "react";
import { useCallback, useState } from "react";
import { useImportFromUrl } from "@/hooks/useDataset";

interface UrlImportProps {
  sessionId: string;
}

export const UrlImport: React.FC<UrlImportProps> = ({ sessionId }) => {
  const importFromUrl = useImportFromUrl();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleImport = useCallback(async () => {
    setError(null);

    const trimmed = url.trim();
    if (!trimmed) {
      setError("Please enter a URL");
      return;
    }

    try {
      new URL(trimmed);
    } catch {
      setError("Please enter a valid URL (e.g. https://example.com)");
      return;
    }

    try {
      await importFromUrl.mutateAsync({ sessionId, url: trimmed });
      setUrl("");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Import failed. Please try again.";
      setError(message);
    }
  }, [sessionId, url, importFromUrl]);

  return (
    <div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleImport();
            }
          }}
          placeholder="https://example.com/data-page"
          disabled={importFromUrl.isPending}
          style={{
            flex: 1,
            padding: "8px 12px",
            border: "1px solid #e2e8f0",
            borderRadius: 6,
            fontSize: 13,
            outline: "none",
          }}
        />
        <button
          type="button"
          onClick={handleImport}
          disabled={importFromUrl.isPending || !url.trim()}
          style={{
            padding: "8px 16px",
            borderRadius: 6,
            border: "none",
            backgroundColor:
              importFromUrl.isPending || !url.trim() ? "#94a3b8" : "#0066cc",
            color: "#fff",
            fontSize: 13,
            fontWeight: 500,
            cursor:
              importFromUrl.isPending || !url.trim()
                ? "not-allowed"
                : "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {importFromUrl.isPending ? "Importing..." : "Import URL"}
        </button>
      </div>

      {error && (
        <div
          style={{
            marginTop: 8,
            padding: 8,
            backgroundColor: "#fef2f2",
            color: "#dc2626",
            borderRadius: 4,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {importFromUrl.isSuccess && (
        <div
          style={{
            marginTop: 8,
            padding: 8,
            backgroundColor: "#f0fdf4",
            color: "#16a34a",
            borderRadius: 4,
            fontSize: 13,
          }}
        >
          URL imported successfully! {importFromUrl.data.datasets.length}{" "}
          dataset
          {importFromUrl.data.datasets.length !== 1 ? "s" : ""} created.
        </div>
      )}
    </div>
  );
};
