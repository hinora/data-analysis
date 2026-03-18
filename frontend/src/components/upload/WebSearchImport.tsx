/**
 * WebSearchImport Component
 *
 * Allows users to enter multiple search keywords, view search results,
 * select websites of interest, and import selected websites as datasets.
 */

import type React from "react";
import { useCallback, useState } from "react";
import {
  type SearchWebsiteItem,
  useImportFromUrl,
  useSearchWebsites,
} from "@/hooks/useDataset";

interface WebSearchImportProps {
  sessionId: string;
}

export const WebSearchImport: React.FC<WebSearchImportProps> = ({
  sessionId,
}) => {
  const searchWebsites = useSearchWebsites();
  const importFromUrl = useImportFromUrl();
  const [keywordInput, setKeywordInput] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [importingUrls, setImportingUrls] = useState<Set<string>>(new Set());
  const [importedUrls, setImportedUrls] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const addKeyword = useCallback(() => {
    const trimmed = keywordInput.trim();
    if (trimmed && !keywords.includes(trimmed)) {
      setKeywords((prev) => [...prev, trimmed]);
      setKeywordInput("");
    }
  }, [keywordInput, keywords]);

  const removeKeyword = useCallback((keyword: string) => {
    setKeywords((prev) => prev.filter((k) => k !== keyword));
  }, []);

  const handleSearch = useCallback(async () => {
    if (keywords.length === 0) {
      setError("Please add at least one keyword");
      return;
    }
    setError(null);
    setSelectedUrls(new Set());
    setImportedUrls(new Set());
    setImportError(null);

    try {
      await searchWebsites.mutateAsync({ sessionId, keywords });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Search failed. Please try again.";
      setError(message);
    }
  }, [sessionId, keywords, searchWebsites]);

  const toggleUrl = useCallback((url: string) => {
    setSelectedUrls((prev) => {
      const next = new Set(prev);
      if (next.has(url)) {
        next.delete(url);
      } else {
        next.add(url);
      }
      return next;
    });
  }, []);

  const handleImportSelected = useCallback(async () => {
    if (selectedUrls.size === 0) return;
    setImportError(null);

    const urls = Array.from(selectedUrls);
    const newImporting = new Set(importingUrls);
    for (const url of urls) newImporting.add(url);
    setImportingUrls(newImporting);

    const errors: string[] = [];

    for (const url of urls) {
      try {
        await importFromUrl.mutateAsync({ sessionId, url });
        setImportedUrls((prev) => new Set([...prev, url]));
        setSelectedUrls((prev) => {
          const next = new Set(prev);
          next.delete(url);
          return next;
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Import failed";
        errors.push(`${url}: ${message}`);
      } finally {
        setImportingUrls((prev) => {
          const next = new Set(prev);
          next.delete(url);
          return next;
        });
      }
    }

    if (errors.length > 0) {
      setImportError(`Some imports failed:\n${errors.join("\n")}`);
    }
  }, [selectedUrls, importingUrls, sessionId, importFromUrl]);

  const results: SearchWebsiteItem[] = searchWebsites.data?.results ?? [];

  return (
    <div style={{ overflow: "hidden" }}>
      {/* Keyword Input */}
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <input
          type="text"
          value={keywordInput}
          onChange={(e) => setKeywordInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addKeyword();
            }
          }}
          placeholder="Enter a search keyword..."
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
          onClick={addKeyword}
          disabled={!keywordInput.trim()}
          style={{
            padding: "8px 12px",
            borderRadius: 6,
            border: "1px solid #e2e8f0",
            backgroundColor: !keywordInput.trim() ? "#f1f5f9" : "#fff",
            fontSize: 13,
            cursor: !keywordInput.trim() ? "not-allowed" : "pointer",
            color: "#475569",
          }}
        >
          Add
        </button>
      </div>

      {/* Keywords Tags */}
      {keywords.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            marginBottom: 8,
          }}
        >
          {keywords.map((kw) => (
            <span
              key={kw}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "3px 10px",
                backgroundColor: "#eff6ff",
                color: "#1e40af",
                borderRadius: 12,
                fontSize: 12,
              }}
            >
              {kw}
              <button
                type="button"
                onClick={() => removeKeyword(kw)}
                style={{
                  all: "unset",
                  cursor: "pointer",
                  fontSize: 14,
                  lineHeight: 1,
                  color: "#3b82f6",
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search Button */}
      <button
        type="button"
        onClick={handleSearch}
        disabled={searchWebsites.isPending || keywords.length === 0}
        style={{
          padding: "8px 16px",
          borderRadius: 6,
          border: "none",
          backgroundColor:
            searchWebsites.isPending || keywords.length === 0
              ? "#94a3b8"
              : "#0066cc",
          color: "#fff",
          fontSize: 13,
          fontWeight: 500,
          cursor:
            searchWebsites.isPending || keywords.length === 0
              ? "not-allowed"
              : "pointer",
          marginBottom: 12,
        }}
      >
        {searchWebsites.isPending ? "Searching..." : "Search Websites"}
      </button>

      {error && (
        <div
          style={{
            marginTop: 4,
            marginBottom: 8,
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

      {/* Search Results */}
      {results.length > 0 && (
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <div style={{ fontSize: 13, color: "#64748b" }}>
              {results.length} result{results.length !== 1 ? "s" : ""} found
            </div>
            {selectedUrls.size > 0 && (
              <button
                type="button"
                onClick={handleImportSelected}
                disabled={importingUrls.size > 0}
                style={{
                  padding: "6px 14px",
                  borderRadius: 6,
                  border: "none",
                  backgroundColor:
                    importingUrls.size > 0 ? "#94a3b8" : "#16a34a",
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: importingUrls.size > 0 ? "not-allowed" : "pointer",
                }}
              >
                {importingUrls.size > 0
                  ? "Importing..."
                  : `Import ${selectedUrls.size} selected`}
              </button>
            )}
          </div>

          <div
            style={{
              maxHeight: 300,
              overflowY: "auto",
              border: "1px solid #e2e8f0",
              borderRadius: 6,
            }}
          >
            {results.map((item) => {
              const isImported = importedUrls.has(item.url);
              const isImporting = importingUrls.has(item.url);
              const isSelected = selectedUrls.has(item.url);

              return (
                <label
                  key={item.url}
                  style={{
                    display: "flex",
                    gap: 10,
                    padding: "10px 12px",
                    borderBottom: "1px solid #f1f5f9",
                    cursor: isImported || isImporting ? "default" : "pointer",
                    backgroundColor: isImported
                      ? "#f0fdf4"
                      : isSelected
                        ? "#eff6ff"
                        : "transparent",
                    opacity: isImporting ? 0.6 : 1,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isSelected || isImported}
                    disabled={isImported || isImporting}
                    onChange={() => toggleUrl(item.url)}
                    style={{ marginTop: 2, accentColor: "#0066cc" }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: "#1e293b",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.title}
                      {isImported && (
                        <span
                          style={{
                            marginLeft: 8,
                            fontSize: 11,
                            color: "#16a34a",
                          }}
                        >
                          ✓ Imported
                        </span>
                      )}
                      {isImporting && (
                        <span
                          style={{
                            marginLeft: 8,
                            fontSize: 11,
                            color: "#3b82f6",
                          }}
                        >
                          Importing...
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "#64748b",
                        marginTop: 2,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.description}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "#94a3b8",
                        marginTop: 2,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.url}
                      <span style={{ marginLeft: 8, color: "#cbd5e1" }}>
                        via &quot;{item.keyword}&quot;
                      </span>
                    </div>
                  </div>
                </label>
              );
            })}
          </div>

          {importError && (
            <div
              style={{
                marginTop: 8,
                padding: 8,
                backgroundColor: "#fef2f2",
                color: "#dc2626",
                borderRadius: 4,
                fontSize: 12,
                whiteSpace: "pre-line",
              }}
            >
              {importError}
            </div>
          )}
        </div>
      )}

      {searchWebsites.isSuccess && results.length === 0 && (
        <div
          style={{
            padding: 12,
            color: "#94a3b8",
            fontSize: 13,
            textAlign: "center",
          }}
        >
          No results found. Try different keywords.
        </div>
      )}
    </div>
  );
};
