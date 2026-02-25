/**
 * User Created Event Handler
 * This event is emitted when a new user is created
 *
 * @see https://moleculer.services/docs/0.14/events
 */

import type { TypedContext } from "core.lib/__generated__";
import { defineEvent } from "core.lib/broker";

/**
 * Payload for user.created event
 */
export interface UserCreatedPayload {
  email: string;
  name: string;
  userId: string;
}

export default defineEvent<UserCreatedPayload>({
  async handler(ctx: TypedContext<UserCreatedPayload>) {
    const { userId, email, name } = ctx.params;

    console.log(`📬 [user.created] Received event for user: ${userId}`);
    console.log(`   Email: ${email}, Name: ${name}`);

    // Example: Update user statistics, trigger analytics, etc.
    console.log(`   ✅ User service processed user.created event`);
  },
});
