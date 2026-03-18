/**
 * Register Action
 *
 * Creates a new user account with email and password.
 * Hashes the password, checks for duplicate emails, and returns a JWT token.
 */

import * as bcrypt from "bcryptjs";
import type { Context } from "core.lib/broker";
import { defineAction } from "core.lib/broker";
import * as jwt from "jsonwebtoken";
import { Errors } from "moleculer";
import { dataSource, sanitizeUser, User } from "../../db";

const JWT_SECRET =
  process.env.JWT_SECRET || "data-analysis-secret-key-change-in-production";
const JWT_EXPIRY = (process.env.JWT_EXPIRY ||
  "7d") as jwt.SignOptions["expiresIn"];
const SALT_ROUNDS = 10;

export interface RegisterParams {
  email: string;
  nickName: string;
  password: string;
}

export interface RegisterResult {
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

export default defineAction<RegisterParams, RegisterResult>({
  rest: "POST /register",

  params: {
    email: { type: "email" },
    nickName: { max: 100, min: 1, type: "string" },
    password: { min: 8, type: "string" },
  },

  async handler(ctx: Context<RegisterParams>) {
    const { email, nickName, password } = ctx.params;
    const repo = dataSource.getRepository(User);

    // Check if email already exists
    const existing = await repo.findOne({ where: { email } });
    if (existing) {
      throw new Errors.MoleculerClientError(
        "Email already registered",
        409,
        "ERR_EMAIL_EXISTS",
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Create user
    const user = repo.create({
      email,
      isActive: true,
      isVerified: false,
      nickName,
      passwordHash,
    });

    const saved = await repo.save(user);

    // Generate JWT token
    const token = jwt.sign({ userId: saved.id }, JWT_SECRET, {
      expiresIn: JWT_EXPIRY,
    });

    ctx.broker.logger.info(`User registered: ${saved.id} (${saved.email})`);

    return {
      token,
      user: sanitizeUser(saved),
    };
  },
});
