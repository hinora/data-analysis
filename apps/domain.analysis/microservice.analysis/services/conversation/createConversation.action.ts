/**
 * Create Conversation Action
 *
 * Creates a new conversation within a session. Constructs a system prompt
 * from the session's datasets (schemas, column mappings, AI metadata,
 * tool definitions, mission statement, response format rules).
 * The system prompt is stored as the first ChatMessage and on the Conversation.
 */

import type { TypedContext } from "core.lib/__generated__";
import { defineAction } from "core.lib/broker";
import { Errors } from "moleculer";
import { dataSource } from "../../db";
import { ChatMessage, MessageRole } from "../../db/chat-message.entity";
import { Conversation } from "../../db/conversation.entity";
import { Session } from "../../db/session.entity";

export interface CreateConversationParams {
  sessionId: string;
  name?: string;
}

export interface CreateConversationResult {
  id: string;
  sessionId: string;
  name: string;
  systemPrompt: string;
  messageCount: number;
  createdAt: Date;
}

function generateConversationName(): string {
  const now = new Date();
  const formatted = now.toLocaleDateString("en-US", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    hour12: false,
  });
  return `Conversation — ${formatted}`;
}

export default defineAction<CreateConversationParams, CreateConversationResult>(
  {
    rest: "POST /",

    params: {
      sessionId: { type: "uuid" },
      name: { type: "string", optional: true, min: 1, max: 500 },
    },

    async handler(ctx: TypedContext<CreateConversationParams>) {
      const { sessionId } = ctx.params;
      const sessionRepo = dataSource.getRepository(Session);
      const convRepo = dataSource.getRepository(Conversation);
      const msgRepo = dataSource.getRepository(ChatMessage);

      // Verify session exists
      const session = await sessionRepo.findOneBy({ id: sessionId });
      if (!session) {
        throw new Errors.MoleculerClientError(
          "Session not found",
          404,
          "SESSION_NOT_FOUND",
          { id: sessionId },
        );
      }

      // Fetch datasets for this session (cross-service call)
      let datasets: any[] = [];
      try {
        datasets = (await ctx.call("dataset.listDatasets" as any, {
          sessionId,
        })) as any[];
      } catch (err) {
        ctx.broker.logger.warn(
          "Failed to fetch datasets for system prompt (data microservice may not be accessible):",
          err,
        );
      }

      // Construct system prompt
      const systemPrompt = buildSystemPrompt(session, datasets);

      // Create conversation
      const conversation = convRepo.create({
        sessionId,
        name: ctx.params.name || generateConversationName(),
        systemPrompt,
        messageCount: 1, // system message
      });
      const saved = await convRepo.save(conversation);

      // Store system prompt as first message
      const systemMessage = msgRepo.create({
        conversationId: saved.id,
        sessionId,
        role: MessageRole.SYSTEM,
        content: systemPrompt,
      });
      await msgRepo.save(systemMessage);

      // Update session status and conversation count
      try {
        await ctx.call("session.updateSessionStatus", {
          sessionId,
          trigger: "conversation-created",
        });
      } catch (err) {
        ctx.broker.logger.warn(
          "Failed to update session conversation count:",
          err,
        );
      }

      ctx.broker.logger.info(
        `Conversation created: ${saved.id} in session ${sessionId}`,
      );

      return {
        id: saved.id,
        sessionId: saved.sessionId,
        name: saved.name,
        systemPrompt: saved.systemPrompt,
        messageCount: saved.messageCount,
        createdAt: saved.createdAt,
      };
    },
  },
);

function buildSystemPrompt(session: any, datasets: any[]): string {
  const parts: string[] = [];

  // Mission statement
  parts.push(
    `You are an AI data analysis assistant`,
    "Your role is to help the user analyse their imported data by answering questions, running calculations, and providing insights.",
    "IMPORTANT: Always answer user questions using the language they are asking in.",
    "## Response Format Rules",
    "- Never assume the data is not available. To filter by any column, you can get distinct values of that column first",
    "- Always cite the specific dataset(s) and column(s) used in your analysis",
    "- Include confidence scores (0-1) based on data completeness and query precision",
    "- For numerical results, show the exact calculation or tool invocation used",
    "- If data is insufficient, state what is missing and suggest next steps",
    "- For cross-source analysis, explicitly note which datasets are being compared",
    "- For data in multiple datasets, you can base your analysis on multiple datasets to answer the question, you should explicitly note which datasets you are using and how they relate to each other.",
  );

  // Dataset context
  if (datasets.length > 0) {
    parts.push("## Available Datasets", "");

    for (const ds of datasets) {
      parts.push(`### ${ds.name}`);
      parts.push(`- ID: ${ds.id}`);
      parts.push(`- Type: ${ds.datasetType}`);
      parts.push(`- Format: ${ds.fileType}`);
      parts.push(`- Rows: ${ds.rowCount}`);

      if (ds.columnMappings && ds.columnMappings.length > 0) {
        parts.push("- Columns:");
        for (const col of ds.columnMappings) {
          parts.push(
            `  - \`${col.camelCase}\` (original: "${col.original}", type: ${col.detectedType})`,
          );
        }
      }

      if (ds.structuredMetadata?.datasetDescription) {
        parts.push(
          `- Description: ${ds.structuredMetadata.datasetDescription}`,
        );
      }

      if (ds.unstructuredMetadata?.documentSummary) {
        parts.push(`- Summary: ${ds.unstructuredMetadata.documentSummary}`);
      }

      if (ds.unstructuredMetadata?.keyTopics?.length > 0) {
        parts.push(`- Topics: ${ds.unstructuredMetadata.keyTopics.join(", ")}`);
      }

      parts.push("");
    }
  } else {
    parts.push("No datasets have been imported to this session yet.", "");
  }

  // Truncate to ~15000 chars to stay within reasonable token limits
  const joined = parts.join("\n");
  if (joined.length > 15000) {
    return `${joined.slice(0, 15000)}\n\n[System prompt truncated due to length]`;
  }

  return joined;
}
