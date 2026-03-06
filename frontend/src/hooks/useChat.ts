/**
 * useChat Hook
 *
 * React Query hooks for chat history retrieval.
 * Message sending is handled by useStreamChat (SSE streaming).
 */

import { useQuery } from "@tanstack/react-query";
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
