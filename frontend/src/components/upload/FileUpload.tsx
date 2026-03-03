/**
 * FileUpload Component
 *
 * Drag-and-drop file upload with type validation, progress indicator,
 * and error display. Supports CSV, PDF, and XLSM files.
 */

import type React from "react";
import { useCallback, useRef, useState } from "react";
import { useUploadFile } from "@/hooks/useDataset";

interface FileUploadProps {
  sessionId: string;
}

const _ACCEPTED_TYPES = [
  "text/csv",
  "application/pdf",
  "application/vnd.ms-excel.sheet.macroEnabled.12",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

const ACCEPTED_EXTENSIONS = [".csv", ".pdf", ".xlsm", ".xlsx"];

export const FileUpload: React.FC<FileUploadProps> = ({ sessionId }) => {
  const uploadFile = useUploadFile();
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback((file: File): string | null => {
    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      return `Unsupported file type: ${ext}. Supported: CSV, PDF, XLSM`;
    }
    if (file.size > 100 * 1024 * 1024) {
      return "File too large. Maximum size: 100MB";
    }
    return null;
  }, []);

  const handleUpload = useCallback(
    async (file: File) => {
      setError(null);
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }

      try {
        await uploadFile.mutateAsync({ sessionId, file });
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : "Upload failed. Please try again.";
        setError(message);
      }
    },
    [sessionId, uploadFile, validateFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleUpload(file);
    },
    [handleUpload],
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    // Reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div>
      <button
        type="button"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${isDragging ? "#3b82f6" : "#e2e8f0"}`,
          borderRadius: 8,
          padding: 24,
          textAlign: "center",
          cursor: uploadFile.isPending ? "not-allowed" : "pointer",
          backgroundColor: isDragging ? "eff6ff" : "transparent",
          transition: "all 0.15s",
          opacity: uploadFile.isPending ? 0.6 : 1,
          width: "100%",
          font: "inherit",
          color: "inherit",
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS.join(",")}
          onChange={handleFileSelect}
          style={{ display: "none" }}
        />
        {uploadFile.isPending ? (
          <div>
            <div style={{ fontSize: 14, color: "#3b82f6", fontWeight: 500 }}>
              Uploading...
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
              Parsing and importing data
            </div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 14, color: "#64748b" }}>
              Drop a file here or click to browse
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
              CSV, PDF, XLSM — max 100MB
            </div>
          </div>
        )}
      </button>

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

      {uploadFile.isSuccess && (
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
          File uploaded successfully! {uploadFile.data.datasets.length} dataset
          {uploadFile.data.datasets.length !== 1 ? "s" : ""} imported.
        </div>
      )}
    </div>
  );
};
