/**
 * DataImport Component
 *
 * Unified data import component with three tabs:
 * 1. File Upload — drag-and-drop CSV, PDF, XLSM files
 * 2. URL Import — import data from a web URL
 * 3. Web Search — search by keywords, select and import websites
 */

import type React from "react";
import { useState } from "react";
import { FileUpload } from "./FileUpload";
import { UrlImport } from "./UrlImport";
import { WebSearchImport } from "./WebSearchImport";

interface DataImportProps {
  sessionId: string;
}

type ImportTab = "file" | "url" | "search";

const tabs: Array<{ key: ImportTab; label: string }> = [
  { key: "file", label: "File Upload" },
  { key: "url", label: "Import URL" },
  { key: "search", label: "Web Search" },
];

export const DataImport: React.FC<DataImportProps> = ({ sessionId }) => {
  const [activeTab, setActiveTab] = useState<ImportTab>("file");

  return (
    <div>
      {/* Tab Bar */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid #e2e8f0",
          marginBottom: 12,
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: "6px 14px",
              fontSize: 13,
              fontWeight: activeTab === tab.key ? 600 : 400,
              color: activeTab === tab.key ? "#0066cc" : "#64748b",
              backgroundColor: "transparent",
              border: "none",
              borderBottom:
                activeTab === tab.key
                  ? "2px solid #0066cc"
                  : "2px solid transparent",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "file" && <FileUpload sessionId={sessionId} />}
      {activeTab === "url" && <UrlImport sessionId={sessionId} />}
      {activeTab === "search" && <WebSearchImport sessionId={sessionId} />}
    </div>
  );
};
