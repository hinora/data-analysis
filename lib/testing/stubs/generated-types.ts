/**
 * Generated Types Stub
 *
 * This is a minimal stub for the generated types that are normally created
 * by `npm run generate:types:all`. It provides just enough typing for
 * actions to compile without requiring a full code generation run.
 *
 * Run `npm run generate:types:all` to generate the full types with
 * type-safe ctx.call() / ctx.emit() across all microservices.
 */

import type { GenericObject, Context as MoleculerContext } from "moleculer";
import type { AuthenticatedUser } from "../broker/types";

/**
 * TypedContext — fallback when generated types are not available.
 * Provides the same shape as the generated TypedContext but without
 * strict call/emit typing. The `call` method returns `any` so that
 * actions can destructure results without type errors during testing.
 */
export interface TypedContext<P = unknown, M extends object = GenericObject>
  extends Omit<MoleculerContext<P, M>, "call"> {
  // biome-ignore lint/suspicious/noExplicitAny: permissive call return for test stubs
  call: (...args: any[]) => Promise<any>;
}

/**
 * Authenticated TypedContext with typed call method and authenticated user in meta.
 */
export interface AuthenticatedTypedContext<P = unknown>
  extends TypedContext<P> {
  meta: TypedContext<P>["meta"] & { user: AuthenticatedUser };
}
