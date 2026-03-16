/**
 * useSession Hook
 *
 * Provides React Query hooks for session CRUD operations.
 */

import {
  type QueryFunction,
  useMutation,
  useQuery,
} from "@tanstack/react-query";
import { queryClient } from "@/utils/query";
import { service } from "@/utils/request";

// --- Types ---

export interface Session {
  id: string;
  name: string;
  status: "empty" | "has-data" | "active" | "archived";
  datasetCount: number;
  conversationCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SessionListResponse {
  data: Session[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// --- Query Keys ---

export const SESSION_LIST_KEY = "sessions/list";
export const SESSION_DETAIL_KEY = "sessions/detail";

// --- Queries ---

export const useListSessions = (page = 1, limit = 20) => {
  return useQuery({
    queryKey: [SESSION_LIST_KEY, page, limit],
    queryFn: listSessionsFn,
    refetchInterval: (query) => {
      const result = query.state.data;
      if (!result) return false;
      // Keep polling while any session still has the default name and has datasets
      const hasPendingName = result.data.some(
        (s) => s.name.startsWith("Session —") && s.datasetCount > 0,
      );
      return hasPendingName ? 5000 : false;
    },
  });
};

const listSessionsFn: QueryFunction<
  SessionListResponse,
  [string, number, number]
> = async ({ queryKey }) => {
  const [, page, limit] = queryKey;
  const response = await service.get<SessionListResponse>("/sessions", {
    params: { page, limit },
  });
  return response.data;
};

export const useGetSession = (id: string | undefined) => {
  return useQuery({
    queryKey: [SESSION_DETAIL_KEY, id],
    queryFn: getSessionFn,
    enabled: !!id,
    refetchInterval: (query) => {
      const session = query.state.data;
      if (!session) return false;
      // Keep polling while session still has the default name and has datasets
      // (AI naming runs after metadata generation, there may be a short delay)
      const hasDefaultName = session.name.startsWith("Session —");
      return hasDefaultName && session.datasetCount > 0 ? 5000 : false;
    },
  });
};

const getSessionFn: QueryFunction<
  Session,
  [string, string | undefined]
> = async ({ queryKey }) => {
  const [, id] = queryKey;
  const response = await service.get<Session>(`/sessions/${id}`);
  return response.data;
};

// --- Mutations ---

export const useCreateSession = () => {
  return useMutation({
    mutationFn: async (params?: { name?: string }) => {
      const response = await service.post<Session>("/sessions", params ?? {});
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [SESSION_LIST_KEY] });
    },
  });
};

export const useRenameSession = () => {
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const response = await service.patch<Session>(`/sessions/${id}/rename`, {
        name,
      });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [SESSION_LIST_KEY] });
      queryClient.invalidateQueries({
        queryKey: [SESSION_DETAIL_KEY, data.id],
      });
    },
  });
};

export const useDeleteSession = () => {
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await service.delete<{ success: boolean; id: string }>(
        `/sessions/${id}`,
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [SESSION_LIST_KEY] });
    },
  });
};
