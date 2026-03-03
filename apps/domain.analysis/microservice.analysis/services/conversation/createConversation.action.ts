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
import {
  getDefaultToolEnabledConfig,
  getEnabledToolNamesByCategory,
} from "../../toolConfig";

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
  const toolConfig = getDefaultToolEnabledConfig();
  const { structured, unstructured } =
    getEnabledToolNamesByCategory(toolConfig);

  // Mission statement
  parts.push(
    "You are an AI data analysis assistant.",
    "Your role is to help the user analyse their imported data by answering questions, running calculations, and providing insights.",
    "IMPORTANT: Always answer user questions using the language they are asking in.",
    "",
  );

  // Tool selection rules — critical for avoiding structured/unstructured confusion
  parts.push(
    "## CRITICAL: Tool Selection Rules by Dataset Type",
    "",
    "Each dataset has a `type` field that is either `structured-table` or `unstructured-text`.",
    "You MUST choose tools based on the dataset type. Using the wrong category of tools will produce errors or nonsensical results.",
    "",
  );

  if (structured.length > 0) {
    parts.push(
      "### Structured Data Tools (ONLY for `structured-table` datasets)",
      "These tools operate on tabular row/column data (CSV, Excel). They query numeric fields, filter rows, aggregate values, etc.",
      `- ${structured.join(", ")}`,
      "",
    );
  }

  if (unstructured.length > 0) {
    parts.push(
      "### Unstructured Text Tools (ONLY for `unstructured-text` datasets)",
      "These tools operate on text documents (PDF, TXT, DOCX). They use vector embeddings and AI to search, summarize, and extract information from text.",
      `- ${unstructured.join(", ")}`,
      "",
    );
  }

  parts.push(
    "### How to decide which tools to use:",
    "1. Look at the dataset `type` field listed below.",
    "2. If the dataset type is `structured-table` → use ONLY Structured Data Tools.",
    "3. If the dataset type is `unstructured-text` → use ONLY Unstructured Text Tools.",
    "4. NEVER use structured tools on an `unstructured-text` dataset — they will fail because text datasets have no tabular rows/columns.",
    "5. NEVER use text tools on a `structured-table` dataset — they will fail because structured datasets have no text chunks or embeddings.",
    "6. If the user's question involves both structured and unstructured datasets, use the appropriate tool category for each dataset separately, then combine the insights in your answer.",
    "",
  );

  // Data matching rules
  parts.push(
    "## Data Matching Rules",
    "- NEVER assume no data exists before filtering, and NEVER assume any specific values exist in the data without first checking with the getDistinctValues tool.",
    "- NEVER assume the exact format of data in the database.",
    "- BEFORE filtering by any field value, you MUST first use getDistinctValues tool to check what values actually exist in the database.",
    "- For data in multiple datasets, you can base your analysis on multiple datasets to answer the question. You should explicitly note which datasets you are using and how they relate to each other.",
    "- Never mention the tool name you are using to the user.",
    "- NEVER use getDistinctValues on numeric/number fields — it is only meaningful for categorical or text fields (e.g. status, category, country). For numeric fields, use countDistinctValues, getMinMax, getPercentile, or aggregate instead.",
    "- When calling getDistinctValues, always provide a reasonable limit (e.g. 50) to avoid returning too many values for high-cardinality fields.",
    "- Use countDistinctValues first to check how many distinct values a field has before calling getDistinctValues, especially for fields with potentially high cardinality.",
  );

  // Dataset context
  if (datasets.length > 0) {
    const structuredDatasets = datasets.filter(
      (ds) => ds.datasetType === "structured-table",
    );
    const unstructuredDatasets = datasets.filter(
      (ds) => ds.datasetType === "unstructured-text",
    );

    parts.push("## Available Datasets", "");

    if (structuredDatasets.length > 0) {
      parts.push(
        "### Structured Table Datasets (use Structured Data Tools only)",
        "",
      );
      for (const ds of structuredDatasets) {
        appendDatasetInfo(parts, ds);
      }
    }

    if (unstructuredDatasets.length > 0) {
      parts.push(
        "### Unstructured Text Datasets (use Unstructured Text Tools only)",
        "",
      );
      for (const ds of unstructuredDatasets) {
        appendDatasetInfo(parts, ds);
      }
    }
  } else {
    parts.push("No datasets have been imported to this session yet.", "");
  }

  // Truncate to ~15000 chars to stay within reasonable token limits
  const joined = parts.join("\n");
  // if (joined.length > 15000) {
  //   return `${joined.slice(0, 15000)}\n\n[System prompt truncated due to length]`;
  // }

  return joined;
}

function appendDatasetInfo(parts: string[], ds: any): void {
  parts.push(`#### ${ds.name}`);
  parts.push(`- ID: ${ds.id}`);
  parts.push(`- Type: ${ds.datasetType}`);
  parts.push(`- Format: ${ds.fileType}`);
  parts.push(`- Rows: ${ds.rowCount}`);

  if (ds.columnMappings && ds.columnMappings.length > 0) {
    parts.push("- Columns:");
    for (const col of ds.columnMappings) {
      parts.push(
        `  - \`${col.camelCase}\` (original: "${col.original}", type: ${col.detectedType}, description: ${col.description || "N/A"})`,
      );
    }
  }

  if (ds.structuredMetadata?.datasetDescription) {
    parts.push(`- Description: ${ds.structuredMetadata.datasetDescription}`);
  }

  if (ds.unstructuredMetadata?.documentSummary) {
    parts.push(`- Summary: ${ds.unstructuredMetadata.documentSummary}`);
  }

  if (ds.unstructuredMetadata?.keyTopics?.length > 0) {
    parts.push(`- Topics: ${ds.unstructuredMetadata.keyTopics.join(", ")}`);
  }

  parts.push("");
}
