/**
 * JWT Configuration
 *
 * Shared JWT secret and expiry settings for all auth actions.
 * In production, JWT_SECRET must be set via environment variable.
 */

import type { SignOptions } from "jsonwebtoken";

const DEFAULT_SECRET = "data-analysis-secret-key-change-in-production";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error(
      "JWT_SECRET environment variable must be set in production",
    );
  }
  return secret || DEFAULT_SECRET;
}

export const JWT_SECRET = getJwtSecret();
export const JWT_EXPIRY = (process.env.JWT_EXPIRY ||
  "7d") as SignOptions["expiresIn"];
