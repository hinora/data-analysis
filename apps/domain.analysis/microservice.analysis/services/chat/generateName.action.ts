/**
 * Generate Name Action
 *
 * Uses AI to generate a short, descriptive name for a session or conversation.
 * - Session: named based on dataset names/types uploaded to the session.
 * - Conversation: named based on the user's first question.
 *
 * Internal action (no REST endpoint) — called by event handlers and other actions.
 */

import { createAIAdapter } from "core.lib/adapters/ai";
import type { TypedContext } from "core.lib/__generated__";
import { defineAction } from "core.lib/broker";
import { AILog, AILogPurpose, AILogStatus, AILogType } from "core.lib/database";
import { dataSource } from "../../db";

export interface GenerateNameParams {
  /** Context to generate the name from (dataset names, user question, etc.) */
  context: string;
  /** What kind of entity we're naming */
  target: "conversation" | "session";
}

export interface GenerateNameResult {
  name: string;
}

const PROMPTS: Record<GenerateNameParams["target"], string> = {
  conversation: [
    "Generate a short, descriptive title for a chat conversation based on the user's first message.",
    "The title should capture the main intent or topic of the question.",
    "Rules:",
    "- Maximum 60 characters",
    "- No quotes or special formatting",
    "- Use natural, readable language",
    "- Be specific to the question's topic",
    "Respond with ONLY the title, nothing else.",
  ].join("\n"),
  session: [
    "Generate a short, descriptive name for a data analysis session based on the datasets uploaded.",
    "The name should reflect the domain or subject of the data.",
    "Rules:",
    "- Maximum 60 characters",
    "- No quotes or special formatting",
    "- Use natural, readable language",
    "- Be specific to the data's domain or topic",
    "Respond with ONLY the name, nothing else.",
  ].join("\n"),
};

export default defineAction<GenerateNameParams, GenerateNameResult>({
  params: {
    context: { type: "string", min: 1, max: 5000 },
    target: { type: "enum", values: ["session", "conversation"] },
  },

  async handler(ctx: TypedContext<GenerateNameParams>) {
    const { context, target } = ctx.params;
    const ai = createAIAdapter();
    const aiLogRepo = dataSource.getRepository(AILog);

    const systemPrompt = PROMPTS[target];
    const startTime = Date.now();

    const response = await ai.generateText({
      prompt: context,
      systemPrompt,
      temperature: 0.7,
    });

    const latencyMs = Date.now() - startTime;

    // Clean up the generated name — strip quotes, trim whitespace, enforce max length
    const maxLength = target === "session" ? 200 : 500;
    const name = response.content
      .replace(/^["'""'']+|["'""'']+$/g, "")
      .replace(/\n/g, " ")
      .trim()
      .slice(0, maxLength);

    // Log AI interaction
    await aiLogRepo.save(
      aiLogRepo.create({
        completionTokens: response.completionTokens,
        latencyMs,
        model: response.model,
        promptSent: `[${target} naming] ${context}`,
        promptTokens: response.promptTokens,
        provider: process.env.AI_PROVIDER || "ollama",
        purpose: AILogPurpose.NAME_GENERATION,
        responseReceived: name,
        sessionId: "00000000-0000-0000-0000-000000000000",
        status: AILogStatus.SUCCESS,
        totalTokens: response.totalTokens,
        type: AILogType.CHAT,
      }),
    );

    ctx.broker.logger.info(
      `Generated ${target} name: "${name}" (${latencyMs}ms)`,
    );

    return { name };
  },
});
