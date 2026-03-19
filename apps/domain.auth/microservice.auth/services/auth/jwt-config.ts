/**
 * JWT Configuration
 *
 * Provides helpers for signing and verifying JSON Web Tokens
 * used in the authentication flow.
 */

import jwt, { type SignOptions } from "jsonwebtoken";

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
const JWT_SECRET =
  process.env.JWT_SECRET || "dev-jwt-secret-change-in-production";

/**
 * Sign a JWT token with user payload
 * @param payload - User identification data to embed in the token
 * @returns Signed JWT token string
 */
export function signToken(payload: { email: string; id: string }): string {
  const options: SignOptions = {
    expiresIn: JWT_EXPIRES_IN as SignOptions["expiresIn"],
  };
  return jwt.sign(payload, JWT_SECRET, options);
}

/**
 * Verify and decode a JWT token
 * @param token - JWT token string to verify
 * @returns Decoded payload with user email and id
 * @throws JsonWebTokenError if token is invalid or expired
 */
export function verifyJwt(token: string): { email: string; id: string } {
  return jwt.verify(token, JWT_SECRET) as { email: string; id: string };
}
