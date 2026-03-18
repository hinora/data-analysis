/**
 * Get Profile Action
 *
 * Returns the authenticated user's profile from the JWT token metadata.
 * Protected endpoint - requires valid JWT token.
 */

import type { AuthenticatedContext } from "core.lib/broker";
import { defineAction } from "core.lib/broker";

export interface GetProfileParams {
  /* No params needed - user comes from JWT */
}

export interface GetProfileResult {
  email: string;
  id: string;
  isActive: boolean;
  isVerified: boolean;
  nickName: string;
  photo?: string;
}

export default defineAction<GetProfileParams, GetProfileResult>({
  authentication: true,
  rest: "GET /profile",

  async handler(ctx: AuthenticatedContext<GetProfileParams>) {
    const { email, id, isActive, isVerified, nickName, photo } = ctx.meta.user;

    return {
      email,
      id,
      isActive,
      isVerified,
      nickName,
      ...(photo ? { photo } : {}),
    };
  },
});
