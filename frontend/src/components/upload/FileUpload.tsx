/**
 * FileUpload Component
 *
 * Drag-and-drop file upload with type validation, progress indicator,
 * and error display. Supports CSV, PDF, and XLSM files.
 * Supports multiple file uploads — all files are sent in a single request
 * so that metadata generation runs once, processing datasets one by one.
 */

import type React from "react";
import { useCallback, useRef, useState } from "react";
import { useUploadFiles } from "@/hooks/useDataset";

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
  const { mutateAsync, isPending, isSuccess, data } = useUploadFiles();
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

  const handleUploadFiles = useCallback(
    async (files: File[]) => {
      if (isPending) return;
      setError(null);

      // Validate all files first
      const validFiles: File[] = [];
      const errors: string[] = [];

      for (const file of files) {
        const validationError = validateFile(file);
        if (validationError) {
          errors.push(`${file.name}: ${validationError}`);
        } else {
          validFiles.push(file);
        }
      }

      if (errors.length > 0) {
        setError(errors.join("\n"));
      }

      if (validFiles.length === 0) return;

      try {
        await mutateAsync({ files: validFiles, sessionId });
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : "Upload failed. Please try again.";
        setError(message);
      }
    },
    [isPending, sessionId, mutateAsync, validateFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) handleUploadFiles(files);
    },
    [handleUploadFiles],
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length > 0) handleUploadFiles(files);
    // Reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const totalDatasetsImported =
    data?.files.reduce((sum, f) => sum + f.datasets.length, 0) ?? 0;

  return (
    <div>
      <button
        type="button"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        disabled={isPending}
        style={{
          border: `2px dashed ${isDragging ? "#3b82f6" : "#e2e8f0"}`,
          borderRadius: 8,
          padding: 24,
          textAlign: "center",
          cursor: isPending ? "not-allowed" : "pointer",
          backgroundColor: isDragging ? "#eff6ff" : "transparent",
          transition: "all 0.15s",
          opacity: isPending ? 0.6 : 1,
          width: "100%",
          font: "inherit",
          color: "inherit",
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS.join(",")}
          multiple
          onChange={handleFileSelect}
          style={{ display: "none" }}
        />
        {isPending ? (
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
              Drop files here or click to browse
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
            whiteSpace: "pre-line",
          }}
        >
          {error}
        </div>
      )}

      {isSuccess && data && (
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
          {data.files.length === 1
            ? `File uploaded successfully! ${totalDatasetsImported} dataset${totalDatasetsImported !== 1 ? "s" : ""} imported.`
            : `${data.files.length} files uploaded successfully! ${totalDatasetsImported} dataset${totalDatasetsImported !== 1 ? "s" : ""} imported.`}
        </div>
      )}
    </div>
  );
};
