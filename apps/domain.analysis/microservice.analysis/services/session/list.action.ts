/**
 * List Sessions Action
 *
 * Returns paginated sessions sorted by createdAt DESC.
 */

import type { TypedContext } from "core.lib/__generated__";
import { defineAction } from "core.lib/broker";
import { dataSource } from "../../db";
import { Session } from "../../db/session.entity";

export interface ListSessionsParams {
  page?: number;
  limit?: number;
}

export interface ListSessionsResult {
  data: Session[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export default defineAction<ListSessionsParams, ListSessionsResult>({
  rest: "GET /",

  params: {
    page: {
      type: "number",
      convert: true,
      optional: true,
      integer: true,
      min: 1,
      default: 1,
    },
    limit: {
      type: "number",
      convert: true,
      optional: true,
      integer: true,
      min: 1,
      max: 100,
      default: 20,
    },
  },

  async handler(ctx: TypedContext<ListSessionsParams>) {
    const page = ctx.params.page ?? 1;
    const limit = ctx.params.limit ?? 20;
    const skip = (page - 1) * limit;

    const repo = dataSource.getRepository(Session);

    const [data, total] = await repo.findAndCount({
      order: { createdAt: "DESC" },
      skip,
      take: limit,
    });

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  },
});
