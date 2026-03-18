/**
 * Verify Token Action
 *
 * Validates a JWT token and returns the associated user.
 * Internal action - not exposed via REST, only callable by other services.
 * This is called by the authentication hook in defineAction.
 */

import type { TypedContext } from "core.lib/__generated__";
import { defineAction } from "core.lib/broker";
import { Errors } from "moleculer";
import { dataSource, User } from "../../db";
import { verifyJwt } from "./jwt-config";

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
    photo?: string;
  };
  valid: true;
}

export default defineAction<VerifyTokenParams, VerifyTokenResult>({
  params: {
    token: { type: "string" },
  },

  async handler(ctx: TypedContext<VerifyTokenParams>) {
    const { token } = ctx.params;

    let payload: { email: string; id: string };
    try {
      payload = verifyJwt(token);
    } catch {
      throw new Errors.MoleculerClientError(
        "Invalid or expired token",
        401,
        "ERR_INVALID_TOKEN",
      );
    }

    const userRepository = dataSource.getRepository(User);
    const user = await userRepository.findOne({ where: { id: payload.id } });

    if (!user) {
      throw new Errors.MoleculerClientError(
        "User not found",
        401,
        "ERR_USER_NOT_FOUND",
      );
    }

    if (!user.isActive) {
      throw new Errors.MoleculerClientError(
        "Account is deactivated",
        401,
        "ERR_ACCOUNT_INACTIVE",
      );
    }

    return {
      user: {
        email: user.email,
        id: user.id,
        isActive: user.isActive,
        isVerified: user.isVerified,
        nickName: user.nickName,
        ...(user.photo ? { photo: user.photo } : {}),
      },
      valid: true,
    };
  },
});
