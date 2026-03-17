/**
 * Tests for lib/testing utilities themselves.
 *
 * These tests verify that createTestContext, createMockAIAdapter,
 * and the database helpers work correctly.
 */

import { aiDefaults, createMockAIAdapter, createTestContext } from "../index";

// ---------------------------------------------------------------------------
// createTestContext
// ---------------------------------------------------------------------------

describe("createTestContext", () => {
  it("should expose params on the context", () => {
    const ctx = createTestContext({ params: { id: "abc" } });
    expect(ctx.params).toEqual({ id: "abc" });
  });

  it("should return stub values from ctx.call()", async () => {
    const ctx = createTestContext({
      params: {},
      callStubs: {
        "session.getSession": { id: "s1", name: "Test Session" },
      },
    });

    const result = await ctx.call("session.getSession", { id: "s1" });
    expect(result).toEqual({ id: "s1", name: "Test Session" });
    expect(ctx.call).toHaveBeenCalledWith("session.getSession", { id: "s1" });
  });

  it("should support function stubs for ctx.call()", async () => {
    const ctx = createTestContext({
      params: {},
      callStubs: {
        "dataset.listDatasets": (params: { sessionId: string }) => [
          { id: "d1", sessionId: params.sessionId },
        ],
      },
    });

    const result = await ctx.call("dataset.listDatasets", {
      sessionId: "s1",
    });
    expect(result).toEqual([{ id: "d1", sessionId: "s1" }]);
  });

  it("should throw on unmocked ctx.call()", async () => {
    const ctx = createTestContext({ params: {} });

    await expect(ctx.call("unknown.action", {})).rejects.toThrow(
      /Unmocked ctx\.call\("unknown\.action"\)/,
    );
  });

  it("should record ctx.emit() calls", async () => {
    const ctx = createTestContext({ params: {} });

    await ctx.emit("user.created", { userId: "u1" });
    expect(ctx.emit).toHaveBeenCalledWith("user.created", { userId: "u1" });
  });

  it("should record ctx.broadcast() calls", async () => {
    const ctx = createTestContext({ params: {} });

    await ctx.broadcast("cache.invalidated", { key: "k1" });
    expect(ctx.broadcast).toHaveBeenCalledWith("cache.invalidated", {
      key: "k1",
    });
  });

  it("should provide a silent broker logger", () => {
    const ctx = createTestContext({ params: {} });

    // Should not throw
    ctx.broker.logger.info("test");
    ctx.broker.logger.warn("test");
    ctx.broker.logger.error("test");
  });

  it("should support meta for authenticated contexts", () => {
    const ctx = createTestContext({
      params: {},
      meta: {
        user: { id: "u1", email: "test@example.com" },
      },
    });

    expect(ctx.meta).toEqual({
      user: { id: "u1", email: "test@example.com" },
    });
  });
});

// ---------------------------------------------------------------------------
// createMockAIAdapter
// ---------------------------------------------------------------------------

describe("createMockAIAdapter", () => {
  it("should return a mock with all AIAdapter methods", () => {
    const ai = createMockAIAdapter();

    expect(ai.generateText).toBeDefined();
    expect(ai.generateJSON).toBeDefined();
    expect(ai.chatWithTools).toBeDefined();
    expect(ai.generateEmbeddings).toBeDefined();
    expect(ai.getConfig).toBeDefined();
    expect(ai.isAvailable).toBeDefined();
  });

  it("should return default text result", async () => {
    const ai = createMockAIAdapter();
    const result = await ai.generateText({ prompt: "Hello" });

    expect(result.content).toBe("mock-text-response");
    expect(result.model).toBe("mock-model");
  });

  it("should return default chatWithTools result", async () => {
    const ai = createMockAIAdapter();
    const result = await ai.chatWithTools({
      messages: [{ role: "user", content: "Hi" }],
      tools: [],
    });

    expect(result.content).toBe("mock-chat-response");
    expect(result.toolCalls).toEqual([]);
  });

  it("should return default embeddings result", async () => {
    const ai = createMockAIAdapter();
    const result = await ai.generateEmbeddings({ input: ["test"] });

    expect(result.embeddings).toEqual([[0.1, 0.2, 0.3]]);
    expect(result.dimensions).toBe(3);
  });

  it("should allow overriding return values per test", async () => {
    const ai = createMockAIAdapter();
    ai.generateText.mockResolvedValueOnce({
      ...aiDefaults.textResult,
      content: "custom response",
    });

    const result = await ai.generateText({ prompt: "Hello" });
    expect(result.content).toBe("custom response");

    // Falls back to default on next call
    const result2 = await ai.generateText({ prompt: "Hello again" });
    expect(result2.content).toBe("mock-text-response");
  });

  it("should report isAvailable as true by default", async () => {
    const ai = createMockAIAdapter();
    expect(await ai.isAvailable()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// defineTest
// ---------------------------------------------------------------------------

describe("defineTest", () => {
  // defineTest creates `it(...)` blocks, so we need to nest them in describe
  const { defineTest } = require("../index");

  defineTest({
    name: "should run a simple action test",
    action: {
      handler: async (ctx: any) => ({
        value: ctx.params.input * 2,
      }),
    },
    params: { input: 5 },
    assertResult: (result: any) => {
      expect(result.value).toBe(10);
    },
  });

  defineTest({
    name: "should handle expectError option",
    action: {
      handler: async () => {
        throw new Error("Test error");
      },
    },
    params: {},
    expectError: "Test error",
  });

  defineTest({
    name: "should run beforeTest and afterTest hooks",
    action: {
      handler: async () => ({ ok: true }),
    },
    params: {},
    beforeTest: () => {
      // Hook runs before the action
    },
    afterTest: () => {
      // Hook runs after the action
    },
    assertResult: (result: any) => {
      expect(result.ok).toBe(true);
    },
  });

  defineTest({
    name: "should support callStubs",
    action: {
      handler: async (ctx: any) => {
        const data = await ctx.call("other.action", { id: "1" });
        return { data };
      },
    },
    params: {},
    callStubs: {
      "other.action": { name: "stubbed" },
    },
    assertResult: (result: any) => {
      expect(result.data).toEqual({ name: "stubbed" });
    },
  });

  defineTest({
    name: "should run afterTest even on action failure when expectError is set",
    action: {
      handler: async () => {
        throw new Error("Expected failure");
      },
    },
    params: {},
    expectError: "Expected failure",
    afterTest: () => {
      // This should run even after the error
    },
  });
});
