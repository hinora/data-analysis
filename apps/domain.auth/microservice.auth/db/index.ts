/**
 * Auth Database Configuration
 *
 * TypeORM DataSource for the auth_db (User).
 * Initialised on microservice startup; entities are registered here.
 */

import { createDataSource } from "core.lib/database";
import { User } from "./user.entity";

export { User } from "./user.entity";

const AUTH_DB_URI =
  process.env.AUTH_DB_URI ||
  "postgresql://postgres:postgres@localhost:5432/auth_db";

export const dataSource = createDataSource({
  databaseUri: AUTH_DB_URI,
  entities: [User],
  synchronize: process.env.NODE_ENV !== "production",
});

/**
 * Strips sensitive fields from a User entity.
 * Returns a safe object without passwordHash, resetToken, and resetTokenExpiry.
 */
export function sanitizeUser(user: User) {
  const { passwordHash, resetToken, resetTokenExpiry, ...safe } = user;
  return safe;
}
