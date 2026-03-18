/**
 * Login Action
 *
 * Authenticates a user with email and password.
 * Validates credentials, checks account status, and returns a JWT token.
 */

import * as bcrypt from "bcryptjs";
import * as jwt from "jsonwebtoken";
import { Errors } from "moleculer";
import { defineAction } from "core.lib/broker";
import type { Context } from "core.lib/broker";
import { dataSource, sanitizeUser, User } from "../../db";

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "data-analysis-secret-key-change-in-production";
const JWT_EXPIRY = process.env.JWT_EXPIRY || "7d";

export interface LoginParams {
  email: string;
  password: string;
}

export interface LoginResult {
  token: string;
  user: {
    email: string;
    id: string;
    isActive: boolean;
    isVerified: boolean;
    nickName: string;
    photo: string | null;
  };
}

export default defineAction<LoginParams, LoginResult>({
  rest: "POST /login",

  params: {
    email: { type: "email" },
    password: { type: "string" },
  },

  async handler(ctx: Context<LoginParams>) {
    const { email, password } = ctx.params;
    const repo = dataSource.getRepository(User);

    // Find user by email
    const user = await repo.findOne({ where: { email } });
    if (!user) {
      throw new Errors.MoleculerClientError(
        "Invalid email or password",
        401,
        "ERR_INVALID_CREDENTIALS",
      );
    }

    // Compare password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new Errors.MoleculerClientError(
        "Invalid email or password",
        401,
        "ERR_INVALID_CREDENTIALS",
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

    // Generate JWT token
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
      expiresIn: JWT_EXPIRY,
    });

    ctx.broker.logger.info(`User logged in: ${user.id} (${user.email})`);

    return {
      token,
      user: sanitizeUser(user),
    };
  },
});
