/**
 * Update Profile Action
 *
 * Updates the authenticated user's profile (nickName, photo).
 * Protected endpoint - requires valid JWT token.
 */

import type { AuthenticatedContext } from "core.lib/broker";
import { defineAction } from "core.lib/broker";
import { Errors } from "moleculer";
import { dataSource, User } from "../../db";

export interface UpdateProfileParams {
  nickName?: string;
  photo?: string;
}

export interface UpdateProfileResult {
  email: string;
  id: string;
  isActive: boolean;
  isVerified: boolean;
  nickName: string;
  photo: string | null;
  updatedAt: Date;
}

export default defineAction<UpdateProfileParams, UpdateProfileResult>({
  authentication: true,
  params: {
    nickName: { max: 100, min: 1, optional: true, type: "string" },
    photo: { max: 500, optional: true, type: "string" },
  },
  rest: "PUT /profile",

  async handler(ctx: AuthenticatedContext<UpdateProfileParams>) {
    const { nickName, photo } = ctx.params;
    const userId = ctx.meta.user.id;

    const userRepository = dataSource.getRepository(User);

    const user = await userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new Errors.MoleculerClientError(
        "User not found",
        404,
        "ERR_USER_NOT_FOUND",
      );
    }

    if (nickName !== undefined) {
      user.nickName = nickName;
    }

    if (photo !== undefined) {
      user.photo = photo;
    }

    const updatedUser = await userRepository.save(user);

    return {
      email: updatedUser.email,
      id: updatedUser.id,
      isActive: updatedUser.isActive,
      isVerified: updatedUser.isVerified,
      nickName: updatedUser.nickName,
      photo: updatedUser.photo,
      updatedAt: updatedUser.updatedAt,
    };
  },
});
