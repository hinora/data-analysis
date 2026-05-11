/**
 * Forgot Password Action
 *
 * Initiates a password reset flow. Currently returns a success message
 * without revealing whether the email exists (security best practice).
 * Public endpoint - no authentication required.
 */

import type { TypedContext } from "core.lib/__generated__";
import { defineAction } from "core.lib/broker";

export interface ForgotPasswordParams {
  email: string;
}

export interface ForgotPasswordResult {
  message: string;
  success: boolean;
}

export default defineAction<ForgotPasswordParams, ForgotPasswordResult>({
  params: {
    email: { type: "email" },
  },
  rest: "POST /forgot-password",

  async handler(_ctx: TypedContext<ForgotPasswordParams>) {
    // TODO: Implement actual password reset email sending
    // For security, always return success regardless of whether the email exists
    return {
      message: "If the email exists, a reset link has been sent.",
      success: true,
    };
  },
});
