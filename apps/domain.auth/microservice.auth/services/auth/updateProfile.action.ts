/**
 * Update Profile Action
 *
 * Updates the authenticated user's profile fields (nickName, photo).
 * Requires authentication — uses ctx.meta.user.id to identify the user.
 */

import { type AuthenticatedContext, defineAction } from "core.lib/broker";
import { Errors } from "moleculer";
import { dataSource, sanitizeUser, User } from "../../db";

export interface UpdateProfileParams {
  nickName?: string;
  photo?: string;
}

export interface UpdateProfileResult {
  createdAt: Date;
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
  rest: "PATCH /profile",

  params: {
    nickName: { max: 100, min: 1, optional: true, type: "string" },
    photo: { max: 500, optional: true, type: "string" },
  },

  async handler(ctx: AuthenticatedContext<UpdateProfileParams>) {
    const { id } = ctx.meta.user;
    const { nickName, photo } = ctx.params;
    const repo = dataSource.getRepository(User);

    const user = await repo.findOne({ where: { id } });
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

    const saved = await repo.save(user);

    ctx.broker.logger.info(`Profile updated: ${saved.id}`);

    return sanitizeUser(saved);
  },
});
