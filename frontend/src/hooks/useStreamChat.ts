/**
 * useStreamChat Hook
 *
 * Consumes the SSE stream from `POST /chat/messages` and exposes
 * real-time reasoning steps, tool calls, content deltas, and the final
 * saved message to the UI.
 *
 * Uses XMLHttpRequest (progressive loading via readyState 3) instead of
 * fetch + ReadableStream because fetch may buffer SSE chunks in certain
 * browser / proxy configurations, preventing real-time event delivery.
 */

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { CHAT_HISTORY_KEY, type ChatMessage } from "./useChat";
import { CONVERSATION_LIST_KEY } from "./useConversation";

// ── SSE event types (mirrors backend StreamEvent) ───────────────────────

export interface StreamEventStatus {
  message: string;
  type: "status";
}

export interface StreamEventToolStart {
  parameters: Record<string, unknown>;
  toolName: string;
  type: "tool_start";
}

export interface StreamEventToolEnd {
  durationMs: number;
  resultPreview: string;
  success: boolean;
  toolName: string;
  type: "tool_end";
}

export interface StreamEventReasoning {
  step: string;
  type: "reasoning";
}

export interface StreamEventContentDelta {
  delta: string;
  type: "content_delta";
}

export interface StreamEventDone {
  message: ChatMessage;
  type: "done";
}

export interface StreamEventError {
  message: string;
  type: "error";
}

export type StreamEvent =
  | StreamEventContentDelta
  | StreamEventDone
  | StreamEventError
  | StreamEventReasoning
  | StreamEventStatus
  | StreamEventToolEnd
  | StreamEventToolStart;

// ── Streaming state exposed to the UI ────────────────────────────────

export interface ActiveTool {
  durationMs?: number;
  parameters: Record<string, unknown>;
  resultPreview?: string;
  status: "error" | "running" | "success";
  toolName: string;
}

export interface StreamingState {
  /** Accumulated text content from content_delta events */
  content: string;
  /** Error message if the stream failed */
  error: string | null;
  /** Final saved message (available after "done" event) */
  finalMessage: ChatMessage | null;
  /** Whether the stream is currently active */
  isStreaming: boolean;
  /** The user message content that was sent (for optimistic rendering) */
  pendingUserMessage: string | null;
  /** Ordered reasoning steps received so far */
  reasoningSteps: string[];
  /** Current status message */
  statusMessage: string;
  /** Tool calls in progress or completed */
  tools: ActiveTool[];
}

const INITIAL_STATE: StreamingState = {
  content: "",
  error: null,
  finalMessage: null,
  isStreaming: false,
  pendingUserMessage: null,
  reasoningSteps: [],
  statusMessage: "",
  tools: [],
};

const BASE_URL = process.env.BASE_API ?? "http://localhost:3000/api";

// ── SSE line parser ─────────────────────────────────────────────────────

/**
 * Parse raw SSE text starting from `startIndex`. Returns parsed events and
 * the index up to which the text has been consumed (so the caller can
 * continue from there on the next progress event).
 */
function parseSSEFrom(
  text: string,
  startIndex: number,
): { endIndex: number; events: StreamEvent[] } {
  const events: StreamEvent[] = [];
  const chunk = text.slice(startIndex);
  const blocks = chunk.split("\n\n");

  // The last block may be incomplete — don't consume it yet.
  const incomplete = blocks.pop() ?? "";
  const consumed = chunk.length - incomplete.length;

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    // Find the `data:` line
    const dataLine = trimmed
      .split("\n")
      .find((line) => line.startsWith("data:"));
    if (!dataLine) continue;

    const json = dataLine.slice("data:".length).trim();
    try {
      const parsed = JSON.parse(json) as StreamEvent;
      events.push(parsed);
    } catch {
      // Skip malformed events
    }
  }

  return { endIndex: startIndex + consumed, events };
}

// ── Hook ────────────────────────────────────────────────────────────────

export function useStreamMessage() {
  const [streamState, setStreamState] = useState<StreamingState>(INITIAL_STATE);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const queryClient = useQueryClient();

  /** Cancel an in-flight stream. */
  const cancel = useCallback(() => {
    if (xhrRef.current) {
      xhrRef.current.abort();
      xhrRef.current = null;
    }
    setStreamState((prev) => ({ ...prev, isStreaming: false }));
  }, []);

  /** Send a message and start consuming the SSE stream. */
  const sendMessage = useCallback(
    (req: { content: string; conversationId: string }) => {
      // Abort any previous request
      if (xhrRef.current) {
        xhrRef.current.abort();
      }

      // Reset state
      setStreamState({
        ...INITIAL_STATE,
        isStreaming: true,
        pendingUserMessage: req.content,
        statusMessage: "Connecting…",
      });

      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;

      // Track how far we've parsed in responseText
      let parsedIndex = 0;

      // Progressive loading: process chunks as they arrive
      xhr.onreadystatechange = () => {
        // readyState 3 = LOADING (partial data available)
        // readyState 4 = DONE (complete)
        if (xhr.readyState >= 3 && xhr.status === 200) {
          const text = xhr.responseText;
          const { endIndex, events } = parseSSEFrom(text, parsedIndex);
          parsedIndex = endIndex;

          for (const event of events) {
            applyEvent(event, setStreamState, queryClient, req.conversationId);
          }
        }

        // Stream complete
        if (xhr.readyState === 4) {
          // Parse any remaining data
          if (xhr.status === 200) {
            const text = xhr.responseText;
            const { events } = parseSSEFrom(text, parsedIndex);
            for (const event of events) {
              applyEvent(
                event,
                setStreamState,
                queryClient,
                req.conversationId,
              );
            }
          }

          // Mark finished
          setStreamState((prev) => {
            if (prev.isStreaming) {
              return { ...prev, isStreaming: false };
            }
            return prev;
          });
          xhrRef.current = null;
        }
      };

      xhr.onerror = () => {
        setStreamState((prev) => ({
          ...prev,
          error: "Network error",
          isStreaming: false,
        }));
        xhrRef.current = null;
      };

      xhr.onabort = () => {
        xhrRef.current = null;
      };

      xhr.open("POST", `${BASE_URL}/chat/messages`);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.send(
        JSON.stringify({
          content: req.content,
          conversationId: req.conversationId,
        }),
      );
    },
    [queryClient],
  );

  return { cancel, sendMessage, streamState };
}

// ── State reducer ───────────────────────────────────────────────────────

function applyEvent(
  event: StreamEvent,
  setState: React.Dispatch<React.SetStateAction<StreamingState>>,
  queryClient: ReturnType<typeof useQueryClient>,
  conversationId: string,
): void {
  switch (event.type) {
    case "status":
      setState((prev) => ({ ...prev, statusMessage: event.message }));
      break;

    case "reasoning":
      setState((prev) => ({
        ...prev,
        reasoningSteps: [...prev.reasoningSteps, event.step],
      }));
      break;

    case "tool_start":
      setState((prev) => ({
        ...prev,
        tools: [
          ...prev.tools,
          {
            parameters: event.parameters,
            status: "running",
            toolName: event.toolName,
          },
        ],
      }));
      break;

    case "tool_end":
      setState((prev) => ({
        ...prev,
        tools: prev.tools.map((t) =>
          t.toolName === event.toolName && t.status === "running"
            ? {
                ...t,
                durationMs: event.durationMs,
                resultPreview: event.resultPreview,
                status: event.success
                  ? ("success" as const)
                  : ("error" as const),
              }
            : t,
        ),
      }));
      break;

    case "content_delta":
      setState((prev) => ({
        ...prev,
        content: prev.content + event.delta,
      }));
      break;

    case "done":
      // Invalidate react-query cache so history picks up the new messages
      queryClient.invalidateQueries({
        queryKey: [CHAT_HISTORY_KEY, conversationId],
      });
      // Refetch conversations to pick up AI-generated name after first message
      queryClient.invalidateQueries({
        queryKey: [CONVERSATION_LIST_KEY],
      });
      setState((prev) => ({
        ...prev,
        finalMessage: event.message,
        isStreaming: false,
      }));
      break;

    case "error":
      setState((prev) => ({
        ...prev,
        error: event.message,
        isStreaming: false,
      }));
      break;

    default:
      break;
  }
}
