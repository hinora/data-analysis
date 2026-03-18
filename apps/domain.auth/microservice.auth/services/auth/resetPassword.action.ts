/**
 * Reset Password Action
 *
 * Resets a user's password using a valid reset token.
 * Validates the token, hashes the new password, and clears the reset state.
 */

import * as bcrypt from "bcryptjs";
import { Errors } from "moleculer";
import { defineAction } from "core.lib/broker";
import type { Context } from "core.lib/broker";
import { MoreThan } from "typeorm";
import { dataSource, User } from "../../db";

const SALT_ROUNDS = 10;

export interface ResetPasswordParams {
  password: string;
  token: string;
}

export interface ResetPasswordResult {
  message: string;
  success: true;
}

export default defineAction<ResetPasswordParams, ResetPasswordResult>({
  rest: "POST /reset-password",

  params: {
    password: { min: 8, type: "string" },
    token: { type: "string" },
  },

  async handler(ctx: Context<ResetPasswordParams>) {
    const { password, token } = ctx.params;
    const repo = dataSource.getRepository(User);

    // Find user with matching reset token that hasn't expired
    const user = await repo.findOne({
      where: {
        resetToken: token,
        resetTokenExpiry: MoreThan(new Date()),
      },
    });

    if (!user) {
      throw new Errors.MoleculerClientError(
        "Invalid or expired reset token",
        400,
        "ERR_INVALID_RESET_TOKEN",
      );
    }

    // Hash new password and clear reset state
    user.passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    user.resetToken = null;
    user.resetTokenExpiry = null;

    await repo.save(user);

    ctx.broker.logger.info(`Password reset completed for user: ${user.id}`);

    return {
      message: "Password has been reset successfully",
      success: true,
    };
  },
});
