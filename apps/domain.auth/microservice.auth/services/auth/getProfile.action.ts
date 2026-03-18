/**
 * Get Profile Action
 *
 * Returns the authenticated user's profile.
 * Requires authentication — uses ctx.meta.user.id to look up the user.
 */

import { Errors } from "moleculer";
import { type AuthenticatedContext, defineAction } from "core.lib/broker";
import { dataSource, sanitizeUser, User } from "../../db";

export type GetProfileParams = Record<string, never>;

export interface GetProfileResult {
  createdAt: Date;
  email: string;
  id: string;
  isActive: boolean;
  isVerified: boolean;
  nickName: string;
  photo: string | null;
  updatedAt: Date;
}

export default defineAction<GetProfileParams, GetProfileResult>({
  authentication: true,
  rest: "GET /profile",

  async handler(ctx: AuthenticatedContext<GetProfileParams>) {
    const { id } = ctx.meta.user;
    const repo = dataSource.getRepository(User);

    const user = await repo.findOne({ where: { id } });
    if (!user) {
      throw new Errors.MoleculerClientError(
        "User not found",
        404,
        "ERR_USER_NOT_FOUND",
      );
    }

    return sanitizeUser(user);
  },
});
