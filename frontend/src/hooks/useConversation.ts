/**
 * useConversation Hook
 *
 * React Query hooks for conversation CRUD operations.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { service } from "../utils/request";
import { SESSION_DETAIL_KEY } from "./useSession";

export const CONVERSATION_LIST_KEY = "conversation-list";
export const CONVERSATION_DETAIL_KEY = "conversation-detail";

export interface Conversation {
  id: string;
  sessionId: string;
  name: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export function useListConversations(sessionId: string | undefined) {
  return useQuery({
    queryKey: [CONVERSATION_LIST_KEY, sessionId],
    queryFn: async () => {
      const { data } = await service.get<Conversation[]>(`/conversations`, {
        params: { sessionId },
      });
      return data;
    },
    enabled: !!sessionId,
  });
}

export function useCreateConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ sessionId }: { sessionId: string }) => {
      const { data } = await service.post<Conversation>(`/conversations`, {
        sessionId,
      });
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: [CONVERSATION_LIST_KEY, data.sessionId],
      });
      queryClient.invalidateQueries({
        queryKey: [SESSION_DETAIL_KEY, data.sessionId],
      });
    },
  });
}

export function useGetConversation(id: string | undefined) {
  return useQuery({
    queryKey: [CONVERSATION_DETAIL_KEY, id],
    queryFn: async () => {
      const { data } = await service.get<
        Conversation & { systemPrompt: string }
      >(`/conversations/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

export function useRenameConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { data } = await service.patch<Conversation>(
        `/conversations/${id}/rename`,
        { name },
      );
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: [CONVERSATION_LIST_KEY, data.sessionId],
      });
      queryClient.invalidateQueries({
        queryKey: [CONVERSATION_DETAIL_KEY, data.id],
      });
    },
  });
}

export function useDeleteConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      sessionId,
    }: {
      id: string;
      sessionId: string;
    }) => {
      await service.delete(`/conversations/${id}`);
      return { id, sessionId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: [CONVERSATION_LIST_KEY, data.sessionId],
      });
      queryClient.invalidateQueries({
        queryKey: [SESSION_DETAIL_KEY, data.sessionId],
      });
    },
  });
}
