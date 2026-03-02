/**
 * useChat Hook
 *
 * React Query hooks for chat messaging (sendMessage, getHistory).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { service } from "../utils/request";

export const CHAT_HISTORY_KEY = "chat-history";

export interface CitedSource {
  datasetId: string;
  datasetName: string;
  columnName?: string;
}

export interface ToolUsage {
  toolName: string;
  parameters: Record<string, unknown>;
  resultSummary: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: "system" | "user" | "assistant";
  content: string;
  confidenceScore: number | null;
  citedSources: CitedSource[] | null;
  toolsUsed: ToolUsage[] | null;
  reasoningSteps: string[] | null;
  createdAt: string;
}

export interface ChatHistoryResponse {
  messages: ChatMessage[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export function useGetHistory(
  conversationId: string | undefined,
  options?: { excludeSystem?: boolean },
) {
  return useQuery({
    queryKey: [CHAT_HISTORY_KEY, conversationId, options],
    queryFn: async () => {
      const { data } = await service.get<ChatHistoryResponse>(
        `/chat/messages`,
        {
          params: {
            conversationId,
            limit: 100,
            ...(options?.excludeSystem && { excludeSystem: true }),
          },
        },
      );
      return data;
    },
    enabled: !!conversationId,
    refetchInterval: false,
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      conversationId,
      content,
    }: {
      conversationId: string;
      content: string;
    }) => {
      const { data } = await service.post<ChatMessage>(`/chat/messages`, {
        conversationId,
        content,
      });
      return data;
    },
    onMutate: ({ conversationId, content }) => {
      // Optimistically add the user message to the chat history
      const optimisticMessage: ChatMessage = {
        id: `optimistic-${Date.now()}`,
        conversationId,
        role: "user",
        content,
        confidenceScore: null,
        citedSources: null,
        toolsUsed: null,
        reasoningSteps: null,
        createdAt: new Date().toISOString(),
      };

      // Snapshot all matching history caches so we can roll back on error
      const previousQueries = queryClient.getQueriesData<ChatHistoryResponse>({
        queryKey: [CHAT_HISTORY_KEY, conversationId],
      });

      // Append the optimistic message to every matching cache entry
      queryClient.setQueriesData<ChatHistoryResponse>(
        { queryKey: [CHAT_HISTORY_KEY, conversationId] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            messages: [...old.messages, optimisticMessage],
            total: old.total + 1,
          };
        },
      );

      return { previousQueries };
    },
    onError: (_err, _variables, context) => {
      // Roll back to the previous cache state
      if (context?.previousQueries) {
        for (const [queryKey, data] of context.previousQueries) {
          queryClient.setQueryData(queryKey, data);
        }
      }
    },
    onSettled: (_data, _error, variables) => {
      // Always refetch to get the real server state (including AI response)
      queryClient.invalidateQueries({
        queryKey: [CHAT_HISTORY_KEY, variables.conversationId],
      });
    },
  });
}
