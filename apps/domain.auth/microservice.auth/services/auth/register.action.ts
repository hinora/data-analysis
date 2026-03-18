/**
 * Register Action
 *
 * Creates a new user account with hashed password and returns a JWT token.
 * Public endpoint - no authentication required.
 */

import bcrypt from "bcryptjs";
import type { TypedContext } from "core.lib/__generated__";
import { defineAction } from "core.lib/broker";
import { Errors } from "moleculer";
import { dataSource, User } from "../../db";
import { signToken } from "./jwt-config";

const BCRYPT_ROUNDS = 10;

export interface RegisterParams {
  email: string;
  nickName: string;
  password: string;
}

export interface RegisterResult {
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

export default defineAction<RegisterParams, RegisterResult>({
  params: {
    email: { type: "email" },
    nickName: { max: 100, min: 1, type: "string" },
    password: { min: 6, type: "string" },
  },
  rest: "POST /register",

  async handler(ctx: TypedContext<RegisterParams>) {
    const { email, nickName, password } = ctx.params;

    const userRepository = dataSource.getRepository(User);

    const existingUser = await userRepository.findOne({ where: { email } });
    if (existingUser) {
      throw new Errors.MoleculerClientError(
        "A user with this email already exists",
        409,
        "ERR_EMAIL_EXISTS",
      );
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const user = userRepository.create({
      email,
      nickName,
      password: hashedPassword,
    });

    const savedUser = await userRepository.save(user);

    const token = signToken({ email: savedUser.email, id: savedUser.id });

    return {
      token,
      user: {
        createdAt: savedUser.createdAt,
        email: savedUser.email,
        id: savedUser.id,
        isActive: savedUser.isActive,
        isVerified: savedUser.isVerified,
        nickName: savedUser.nickName,
        photo: savedUser.photo,
      },
    };
  },
});
