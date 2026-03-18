/**
 * Forgot Password Action
 *
 * Generates a password reset token for the given email address.
 * Always returns success to avoid revealing whether the email exists.
 * In production, the reset token would be sent via email.
 */

import * as crypto from "node:crypto";
import type { Context } from "core.lib/broker";
import { defineAction } from "core.lib/broker";
import { dataSource, User } from "../../db";

const RESET_TOKEN_EXPIRY_HOURS = 1;

export interface ForgotPasswordParams {
  email: string;
}

export interface ForgotPasswordResult {
  message: string;
  success: true;
}

export default defineAction<ForgotPasswordParams, ForgotPasswordResult>({
  rest: "POST /forgot-password",

  params: {
    email: { type: "email" },
  },

  async handler(ctx: Context<ForgotPasswordParams>) {
    const { email } = ctx.params;
    const repo = dataSource.getRepository(User);

    const user = await repo.findOne({ where: { email } });

    if (user) {
      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString("hex");
      const resetTokenExpiry = new Date(
        Date.now() + RESET_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000,
      );

      user.resetToken = resetToken;
      user.resetTokenExpiry = resetTokenExpiry;
      await repo.save(user);

      // In production, send email with reset link
      ctx.broker.logger.info(`Password reset token generated for ${email}`);
    }

    // Always return success to avoid revealing if email exists
    return {
      message: "If the email exists, a reset link has been sent",
      success: true,
    };
  },
});
