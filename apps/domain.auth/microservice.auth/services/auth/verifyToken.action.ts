/**
 * Verify Token Action
 *
 * Validates a JWT token and returns the associated user.
 * Called internally by the authentication hook in defineAction.
 * No REST endpoint — internal use only.
 */

import type { Context } from "core.lib/broker";
import { defineAction } from "core.lib/broker";
import * as jwt from "jsonwebtoken";
import { Errors } from "moleculer";
import { dataSource, sanitizeUser, User } from "../../db";
import { JWT_SECRET } from "./jwt-config";

export interface VerifyTokenParams {
  token: string;
}

export interface VerifyTokenResult {
  user: {
    email: string;
    id: string;
    isActive: boolean;
    isVerified: boolean;
    nickName: string;
    photo: string | null;
  };
  valid: true;
}

export default defineAction<VerifyTokenParams, VerifyTokenResult>({
  params: {
    token: { type: "string" },
  },

  async handler(ctx: Context<VerifyTokenParams>) {
    const { token } = ctx.params;

    // Verify JWT token
    let decoded: { userId: string };
    try {
      decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    } catch {
      throw new Errors.MoleculerClientError(
        "Invalid or expired token",
        401,
        "ERR_INVALID_TOKEN",
      );
    }

    const repo = dataSource.getRepository(User);

    // Find user by decoded userId
    const user = await repo.findOne({ where: { id: decoded.userId } });
    if (!user) {
      throw new Errors.MoleculerClientError(
        "User not found",
        401,
        "ERR_USER_NOT_FOUND",
      );
    }

    // Check if account is active
    if (!user.isActive) {
      throw new Errors.MoleculerClientError(
        "Account is disabled",
        403,
        "ERR_ACCOUNT_DISABLED",
      );
    }

    return {
      user: sanitizeUser(user),
      valid: true,
    };
  },
});
