/**
 * Tests for lib/broker/types.ts — defineAction and defineEvent helpers
 *
 * Demonstrates:
 * - Testing lib functions (no database needed)
 * - Verifying function signatures and behavior
 */

import { defineAction, defineEvent } from "core.lib/broker";

describe("defineAction", () => {
  it("should return the action definition as-is for public actions", () => {
    const action = defineAction<{ name: string }, { id: string }>({
      params: {
        name: { type: "string" },
      },
      async handler(ctx) {
        return { id: `user-${ctx.params.name}` };
      },
    });

    expect(action).toBeDefined();
    expect(action.handler).toBeInstanceOf(Function);
    expect(action.params).toEqual({ name: { type: "string" } });
    expect(action.authentication).toBeUndefined();
  });

  it("should add authentication hook for authenticated actions", () => {
    const action = defineAction<{ name: string }, { id: string }>({
      authentication: true,
      params: {
        name: { type: "string" },
      },
      async handler(ctx) {
        return { id: `user-${ctx.meta.user.id}` };
      },
    });

    expect(action.authentication).toBe(true);
    // The defineAction function should have added a before hook
    expect(action.hooks).toBeDefined();
    expect(action.hooks!.before).toBeDefined();
  });

  it("should preserve rest schema", () => {
    const action = defineAction({
      rest: "GET /items",
      async handler() {
        return [];
      },
    });

    expect(action.rest).toBe("GET /items");
  });

  it("should skip authentication for internal service-to-service calls", async () => {
    const action = defineAction<{ name: string }, { id: string }>({
      authentication: true,
      params: {
        name: { type: "string" },
      },
      async handler(ctx) {
        return { id: `user-${ctx.meta.user?.id || "anon"}` };
      },
    });

    const hooks = action.hooks!.before as Array<
      (ctx: any) => Promise<void> | void
    >;
    const authHook = hooks[0];

    // Internal call (caller !== "proxy") — should skip authentication
    const internalCtx: any = {
      caller: "session",
      meta: {},
    };
    await authHook(internalCtx);
    // No error thrown, no user assigned
    expect(internalCtx.meta.user).toBeUndefined();
  });

  it("should throw 401 when no token is provided for proxy calls", async () => {
    const action = defineAction<{ name: string }, { id: string }>({
      authentication: true,
      params: {
        name: { type: "string" },
      },
      async handler(ctx) {
        return { id: `user-${ctx.meta.user.id}` };
      },
    });

    const hooks = action.hooks!.before as Array<
      (ctx: any) => Promise<void> | void
    >;
    const authHook = hooks[0];

    // Proxy call without token — should throw
    const proxyCtx: any = {
      caller: "proxy",
      meta: {},
    };
    await expect(authHook(proxyCtx)).rejects.toThrow(
      "Authentication required: No token provided",
    );
  });

  it("should verify token and set user in meta for proxy calls", async () => {
    const action = defineAction<{ name: string }, { id: string }>({
      authentication: true,
      params: {
        name: { type: "string" },
      },
      async handler(ctx) {
        return { id: `user-${ctx.meta.user.id}` };
      },
    });

    const hooks = action.hooks!.before as Array<
      (ctx: any) => Promise<void> | void
    >;
    const authHook = hooks[0];

    const mockUser = {
      id: "user-1",
      email: "test@test.com",
      nickName: "Test",
      isActive: true,
      isVerified: true,
    };

    const proxyCtx: any = {
      caller: "proxy",
      meta: { token: "valid-token" },
      call: jest.fn().mockResolvedValue({ valid: true, user: mockUser }),
    };

    await authHook(proxyCtx);
    expect(proxyCtx.meta.user).toEqual(mockUser);
    expect(proxyCtx.call).toHaveBeenCalledWith("auth.verifyToken", {
      token: "valid-token",
    });
  });

  it("should throw 401 when token verification fails", async () => {
    const action = defineAction<{ name: string }, { id: string }>({
      authentication: true,
      params: {
        name: { type: "string" },
      },
      async handler(ctx) {
        return { id: `user-${ctx.meta.user.id}` };
      },
    });

    const hooks = action.hooks!.before as Array<
      (ctx: any) => Promise<void> | void
    >;
    const authHook = hooks[0];

    const proxyCtx: any = {
      caller: "proxy",
      meta: { token: "invalid-token" },
      call: jest.fn().mockRejectedValue(new Error("Token expired")),
    };

    await expect(authHook(proxyCtx)).rejects.toThrow("Token expired");
  });

  it("should merge with existing before hooks", () => {
    const existingHook = jest.fn();
    const action = defineAction<{ name: string }, { id: string }>({
      authentication: true,
      hooks: {
        before: existingHook as any,
      },
      async handler(ctx) {
        return { id: "1" };
      },
    });

    const hooks = action.hooks!.before as unknown[];
    // Should have both auth hook and existing hook
    expect(hooks.length).toBe(2);
  });

  it("should merge with existing before hooks array", () => {
    const existingHook1 = jest.fn();
    const existingHook2 = jest.fn();
    const action = defineAction<{ name: string }, { id: string }>({
      authentication: true,
      hooks: {
        before: [existingHook1, existingHook2] as any,
      },
      async handler(ctx) {
        return { id: "1" };
      },
    });

    const hooks = action.hooks!.before as unknown[];
    // Should have auth hook + 2 existing hooks
    expect(hooks.length).toBe(3);
  });
});

describe("defineEvent", () => {
  it("should return the event definition as-is", () => {
    const event = defineEvent<{ userId: string }>({
      async handler(ctx) {
        // Handle event
      },
    });

    expect(event).toBeDefined();
    expect(event.handler).toBeInstanceOf(Function);
  });

  it("should preserve group configuration", () => {
    const event = defineEvent<{ userId: string }>({
      group: "notification-workers",
      async handler(ctx) {
        // Handle event
      },
    });

    expect(event.group).toBe("notification-workers");
  });
});
