/**
 * User Created Event Handler - Notification Service
 * Sends welcome email when a user is created
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
  // Only one notification service instance should send the email
  group: "notification-workers",

  async handler(ctx: TypedContext<UserCreatedPayload>) {
    const { userId, email, name } = ctx.params;

    console.log(`📬 [notification] Received user.created event for: ${userId}`);

    // Simulate sending welcome email
    console.log(`   📧 Sending welcome email to ${email}...`);
    await new Promise((resolve) => setTimeout(resolve, 100)); // Simulate async work
    console.log(`   ✅ Welcome email sent to ${name} (${email})`);
  },
});
