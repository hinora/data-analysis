/**
 * FileUpload Component
 *
 * Drag-and-drop file upload with type validation, progress indicator,
 * and error display. Supports CSV, PDF, and XLSM files.
 * Supports multiple file uploads at the same time — files are uploaded
 * sequentially (one request per file) to avoid overwhelming the server.
 */

import type React from "react";
import { useCallback, useRef, useState } from "react";
import { type UploadResult, useUploadFile } from "@/hooks/useDataset";

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

interface UploadProgress {
  completed: number;
  currentFile: string;
  errors: Array<{ filename: string; message: string }>;
  results: UploadResult[];
  total: number;
}

export const FileUpload: React.FC<FileUploadProps> = ({ sessionId }) => {
  const uploadFile = useUploadFile();
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(
    null,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isUploading =
    uploadProgress !== null && uploadProgress.completed < uploadProgress.total;

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
      if (isUploading) return;

      // Validate all files first
      const validFiles: File[] = [];
      const errors: Array<{ filename: string; message: string }> = [];

      for (const file of files) {
        const validationError = validateFile(file);
        if (validationError) {
          errors.push({ filename: file.name, message: validationError });
        } else {
          validFiles.push(file);
        }
      }

      if (validFiles.length === 0) {
        setUploadProgress({
          completed: 0,
          currentFile: "",
          errors,
          results: [],
          total: 0,
        });
        return;
      }

      const progress: UploadProgress = {
        completed: 0,
        currentFile: validFiles[0].name,
        errors: [...errors],
        results: [],
        total: validFiles.length,
      };
      setUploadProgress({ ...progress });

      // Upload files sequentially (one request per file)
      for (const file of validFiles) {
        progress.currentFile = file.name;
        setUploadProgress({ ...progress });

        try {
          const result = await uploadFile.mutateAsync({ sessionId, file });
          progress.results.push(result);
        } catch (err: unknown) {
          const message =
            err instanceof Error
              ? err.message
              : "Upload failed. Please try again.";
          progress.errors.push({ filename: file.name, message });
        }

        progress.completed++;
        setUploadProgress({ ...progress });
      }
    },
    [isUploading, sessionId, uploadFile, validateFile],
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
    uploadProgress?.results.reduce((sum, r) => sum + r.datasets.length, 0) ?? 0;
  const isComplete =
    uploadProgress !== null &&
    uploadProgress.completed === uploadProgress.total;

  return (
    <div>
      <button
        type="button"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
        style={{
          border: `2px dashed ${isDragging ? "#3b82f6" : "#e2e8f0"}`,
          borderRadius: 8,
          padding: 24,
          textAlign: "center",
          cursor: isUploading ? "not-allowed" : "pointer",
          backgroundColor: isDragging ? "#eff6ff" : "transparent",
          transition: "all 0.15s",
          opacity: isUploading ? 0.6 : 1,
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
        {isUploading ? (
          <div>
            <div style={{ fontSize: 14, color: "#3b82f6", fontWeight: 500 }}>
              Uploading {uploadProgress.completed + 1} of {uploadProgress.total}
              ...
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
              {uploadProgress.currentFile}
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

      {uploadProgress && uploadProgress.errors.length > 0 && (
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
          {uploadProgress.errors.map((e) => (
            <div key={`${e.filename}-${e.message}`}>
              {e.filename}: {e.message}
            </div>
          ))}
        </div>
      )}

      {isComplete && uploadProgress.results.length > 0 && (
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
          {uploadProgress.results.length === 1
            ? `File uploaded successfully! ${totalDatasetsImported} dataset${totalDatasetsImported !== 1 ? "s" : ""} imported.`
            : `${uploadProgress.results.length} files uploaded successfully! ${totalDatasetsImported} dataset${totalDatasetsImported !== 1 ? "s" : ""} imported.`}
        </div>
      )}
    </div>
  );
};
