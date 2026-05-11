/**
 * Login Action
 *
 * Authenticates a user with email and password, returns a JWT token.
 * Public endpoint - no authentication required.
 */

import bcrypt from "bcryptjs";
import type { TypedContext } from "core.lib/__generated__";
import { defineAction } from "core.lib/broker";
import { Errors } from "moleculer";
import { dataSource, User } from "../../db";
import { signToken } from "./jwt-config";

export interface LoginParams {
  email: string;
  password: string;
}

export interface LoginResult {
  token: string;
  user: {
    createdAt: Date;
    email: string;
    id: string;
    isActive: boolean;
    isVerified: boolean;
    nickName: string;
    photo: string | null;
  };
}

export default defineAction<LoginParams, LoginResult>({
  params: {
    email: { type: "string" },
    password: { type: "string" },
  },
  rest: "POST /login",

  async handler(ctx: TypedContext<LoginParams>) {
    const { email, password } = ctx.params;

    const userRepository = dataSource.getRepository(User);

    const user = await userRepository.findOne({ where: { email } });
    if (!user) {
      throw new Errors.MoleculerClientError(
        "Invalid email or password",
        401,
        "ERR_INVALID_CREDENTIALS",
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new Errors.MoleculerClientError(
        "Invalid email or password",
        401,
        "ERR_INVALID_CREDENTIALS",
      );
    }

    if (!user.isActive) {
      throw new Errors.MoleculerClientError(
        "Account is deactivated",
        403,
        "ERR_ACCOUNT_INACTIVE",
      );
    }

    const token = signToken({ email: user.email, id: user.id });

    return {
      token,
      user: {
        createdAt: user.createdAt,
        email: user.email,
        id: user.id,
        isActive: user.isActive,
        isVerified: user.isVerified,
        nickName: user.nickName,
        photo: user.photo,
      },
    };
  },
});
