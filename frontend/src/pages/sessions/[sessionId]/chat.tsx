/**
 * Chat Page
 *
 * Full chat interface for a session: conversation sidebar + message area + input.
 */

import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useEffect, useRef, useState } from "react";
import ChatInput from "../../../components/chat/ChatInput";
import ChatMessageBubble from "../../../components/chat/ChatMessageBubble";
import ConversationSidebar from "../../../components/chat/ConversationSidebar";
import StreamingThinkingIndicator from "../../../components/chat/StreamingThinkingIndicator";
import SystemPromptViewer from "../../../components/chat/SystemPromptViewer";
import { type ChatMessage, useGetHistory } from "../../../hooks/useChat";
import {
  useCreateConversation,
  useListConversations,
} from "../../../hooks/useConversation";
import { useStreamMessage } from "../../../hooks/useStreamChat";

export default function ChatPage() {
  const router = useRouter();
  const { sessionId } = router.query as { sessionId: string };
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Queries
  const { data: conversations, isLoading: convLoading } =
    useListConversations(sessionId);
  const { data: historyData, isLoading: historyLoading } = useGetHistory(
    activeConversationId || undefined,
    { excludeSystem: false },
  );

  // Mutations & streaming
  const createConversation = useCreateConversation();
  const { sendMessage, streamState } = useStreamMessage();

  // Auto-select first conversation
  useEffect(() => {
    if (conversations && conversations.length > 0 && !activeConversationId) {
      setActiveConversationId(conversations[0].id);
    }
  }, [conversations, activeConversationId]);

  // Auto-scroll to bottom on new messages or when streaming
  const messageCount = historyData?.messages.length ?? 0;
  const isStreaming = streamState.isStreaming;
  const streamEventCount =
    streamState.reasoningSteps.length +
    streamState.tools.length +
    (streamState.content ? 1 : 0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: messageCount, isStreaming, and streamEventCount trigger scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messageCount, isStreaming, streamEventCount]);
  console.log(
    "messageCount",
    messageCount,
    "isStreaming",
    isStreaming,
    "streamEventCount",
    streamEventCount,
  );

  const handleCreateConversation = useCallback(() => {
    if (!sessionId) return;
    createConversation.mutate(
      { sessionId },
      {
        onSuccess: (data) => {
          setActiveConversationId(data.id);
        },
      },
    );
  }, [sessionId, createConversation]);

  const handleSendMessage = useCallback(
    (content: string) => {
      if (!activeConversationId) return;
      sendMessage({ conversationId: activeConversationId, content });
    },
    [activeConversationId, sendMessage],
  );

  // Extract system prompt from first message if it's a system message
  const systemPrompt =
    historyData?.messages[0]?.role === "system"
      ? historyData.messages[0].content
      : null;

  // Messages to display (exclude system messages)
  const displayMessages =
    historyData?.messages.filter((m) => m.role !== "system") || [];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div
        style={{
          padding: "12px 20px",
          borderBottom: "1px solid #e0e0e0",
          display: "flex",
          alignItems: "center",
          gap: "16px",
          backgroundColor: "#fff",
        }}
      >
        <Link
          href={`/sessions/${sessionId}`}
          style={{
            color: "#0066cc",
            textDecoration: "none",
            fontSize: "14px",
          }}
        >
          ← Back to Workspace
        </Link>
        <h2 style={{ margin: 0, fontSize: "16px", fontWeight: "600" }}>
          Chat with AI
        </h2>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Sidebar */}
        <ConversationSidebar
          conversations={conversations || []}
          activeConversationId={activeConversationId}
          onSelect={setActiveConversationId}
          onCreate={handleCreateConversation}
          isCreating={createConversation.isPending}
          isLoading={convLoading}
        />

        {/* Chat area */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {activeConversationId ? (
            <>
              {/* System prompt viewer */}
              <SystemPromptViewer systemPrompt={systemPrompt} />

              {/* Messages */}
              <div
                style={{
                  flex: 1,
                  overflow: "auto",
                  padding: "16px",
                }}
              >
                {historyLoading ? (
                  <div
                    style={{
                      textAlign: "center",
                      color: "#999",
                      padding: "32px",
                    }}
                  >
                    Loading messages...
                  </div>
                ) : displayMessages.length === 0 ? (
                  <div
                    style={{
                      textAlign: "center",
                      color: "#999",
                      padding: "64px 32px",
                    }}
                  >
                    <p style={{ fontSize: "16px", marginBottom: "8px" }}>
                      Start a conversation
                    </p>
                    <p style={{ fontSize: "13px" }}>
                      Ask questions about your data, request analysis, or
                      explore insights.
                    </p>
                  </div>
                ) : (
                  displayMessages.map((msg) => (
                    <ChatMessageBubble key={msg.id} message={msg} />
                  ))
                )}
                {/* Optimistic user message shown during streaming */}
                {isStreaming && streamState.pendingUserMessage && (
                  <ChatMessageBubble
                    message={
                      {
                        id: "optimistic-stream",
                        conversationId: activeConversationId ?? "",
                        role: "user",
                        content: streamState.pendingUserMessage,
                        confidenceScore: null,
                        citedSources: null,
                        toolsUsed: null,
                        reasoningSteps: null,
                        createdAt: new Date().toISOString(),
                      } satisfies ChatMessage
                    }
                  />
                )}
                {isStreaming && (
                  <StreamingThinkingIndicator state={streamState} />
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <ChatInput onSend={handleSendMessage} isLoading={isStreaming} />
            </>
          ) : (
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#999",
              }}
            >
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: "16px", marginBottom: "12px" }}>
                  No conversation selected
                </p>
                <button
                  type="button"
                  onClick={handleCreateConversation}
                  disabled={createConversation.isPending}
                  style={{
                    padding: "8px 20px",
                    borderRadius: "8px",
                    border: "none",
                    backgroundColor: "#0066cc",
                    color: "#fff",
                    fontSize: "14px",
                    cursor: "pointer",
                  }}
                >
                  Create New Conversation
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
