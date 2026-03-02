/**
 * useDataset Hook
 *
 * Provides React Query hooks for dataset operations:
 * listing, getting details, uploading files, previewing, renaming, and deleting.
 */

import {
  type QueryFunction,
  useMutation,
  useQuery,
} from "@tanstack/react-query";
import { queryClient } from "@/utils/query";
import { service } from "@/utils/request";
import { SESSION_DETAIL_KEY } from "./useSession";

// --- Types ---

export interface ColumnMapping {
  camelCase: string;
  detectedType: "boolean" | "date" | "number" | "string";
  order: number;
  original: string;
}

export interface Dataset {
  id: string;
  sessionId: string;
  name: string;
  fileType: "csv" | "pdf" | "xlsm";
  datasetType: "structured-table" | "unstructured-text";
  metadataStatus: "pending" | "in-progress" | "ready" | "failed";
  rowCount: number;
  columnCount: number | null;
  columnMappings: ColumnMapping[] | null;
  sheetName: string | null;
  importedAt: string;
  createdAt: string;
  structuredMetadata?: Record<string, unknown> | null;
  unstructuredMetadata?: Record<string, unknown> | null;
  relationships?: unknown[] | null;
}

export interface UploadResult {
  originalFileId: string;
  datasets: Array<{
    id: string;
    name: string;
    datasetType: string;
    rowCount: number;
    columnCount: number | null;
  }>;
}

export interface DatasetPreviewDataset {
  id: string;
  name: string;
  fileType: string;
  datasetType: string;
  rowCount: number;
  columnCount: number | null;
}

export interface DatasetPreviewColumn {
  original: string;
  camelCase: string;
  detectedType: string;
}

export interface DatasetPreview {
  dataset: DatasetPreviewDataset;
  columns: DatasetPreviewColumn[];
  rows: Record<string, unknown>[];
  previewCount: number;
}

// --- Query Keys ---

export const DATASET_LIST_KEY = "datasets/list";
export const DATASET_DETAIL_KEY = "datasets/detail";
export const DATASET_PREVIEW_KEY = "datasets/preview";

// --- Queries ---

export const useListDatasets = (sessionId: string | undefined) => {
  return useQuery({
    queryKey: [DATASET_LIST_KEY, sessionId],
    queryFn: listDatasetsFn,
    enabled: !!sessionId,
  });
};

const listDatasetsFn: QueryFunction<
  Dataset[],
  [string, string | undefined]
> = async ({ queryKey }) => {
  const [, sessionId] = queryKey;
  const response = await service.get<Dataset[]>(`/datasets`, {
    params: { sessionId },
  });
  return response.data;
};

export const useGetDataset = (id: string | undefined) => {
  return useQuery({
    queryKey: [DATASET_DETAIL_KEY, id],
    queryFn: getDatasetFn,
    enabled: !!id,
  });
};

const getDatasetFn: QueryFunction<
  Dataset,
  [string, string | undefined]
> = async ({ queryKey }) => {
  const [, id] = queryKey;
  const response = await service.get<Dataset>(`/datasets/${id}`);
  return response.data;
};

export const usePreviewDataset = (id: string | undefined, limit = 50) => {
  return useQuery({
    queryKey: [DATASET_PREVIEW_KEY, id, limit],
    queryFn: previewDatasetFn,
    enabled: !!id,
  });
};

const previewDatasetFn: QueryFunction<
  DatasetPreview,
  [string, string | undefined, number]
> = async ({ queryKey }) => {
  const [, id, limit] = queryKey;
  const response = await service.get<DatasetPreview>(
    `/datasets/${id}/preview`,
    { params: { limit } },
  );
  return response.data;
};

// --- Mutations ---

export const useUploadFile = () => {
  return useMutation({
    mutationFn: async ({
      sessionId,
      file,
    }: {
      sessionId: string;
      file: File;
    }) => {
      const formData = new FormData();
      formData.append("file", file);

      const response = await service.post<UploadResult>(
        `/sessions/${sessionId}/upload`,
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        },
      );
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: [DATASET_LIST_KEY, variables.sessionId],
      });
      queryClient.invalidateQueries({
        queryKey: [SESSION_DETAIL_KEY, variables.sessionId],
      });
    },
  });
};

export const useRenameDataset = () => {
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const response = await service.patch<Dataset>(`/datasets/${id}/rename`, {
        name,
      });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: [DATASET_LIST_KEY, data.sessionId],
      });
      queryClient.invalidateQueries({
        queryKey: [DATASET_DETAIL_KEY, data.id],
      });
    },
  });
};

export const useDeleteDataset = () => {
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await service.delete<{
        success: boolean;
        id: string;
        sessionId: string;
      }>(`/datasets/${id}`);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: [DATASET_LIST_KEY, data.sessionId],
      });
      queryClient.invalidateQueries({
        queryKey: [SESSION_DETAIL_KEY, data.sessionId],
      });
    },
  });
};
