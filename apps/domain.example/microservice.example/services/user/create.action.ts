/**
 * Create User Action
 * Demonstrates emitting events when a user is created
 */

import type { TypedContext } from "core.lib/__generated__";
import { defineAction } from "core.lib/broker";

export interface CreateUserParams {
  email: string;
  name: string;
}

export interface CreateUserResult {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}

export default defineAction<CreateUserParams, CreateUserResult>({
  params: {
    email: { type: "email" },
    name: { type: "string", min: 2 },
  },

  async handler(ctx: TypedContext<CreateUserParams>) {
    const { email, name } = ctx.params;

    // Simulate user creation
    const user = {
      id: `user-${Date.now()}`,
      email,
      name,
      createdAt: new Date(),
    };

    console.log(`✅ User created: ${user.id} (${user.email})`);

    // Emit event for other services to react (type-safe!)
    await ctx.emit("user.created", {
      email: user.email,
      name: user.name,
      userId: user.id,
    });

    console.log(`📤 Emitted user.created event for ${user.id}`);

    return user;
  },
});
