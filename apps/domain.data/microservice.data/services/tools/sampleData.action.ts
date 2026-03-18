/**
 * Sample Data Tool
 *
 * Preview rows from a structured-table dataset. Returns the first N rows
 * (by insertion order) so the AI can understand column formats, data types,
 * and representative values before performing analysis.
 */

import { type AuthenticatedContext, defineAction } from "core.lib/broker";
import { dataSource } from "../../db";
import { DataRecord } from "../../db/data-record.entity";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

export interface SampleDataParams {
  datasetId: string;
  limit?: number;
}

export default defineAction<SampleDataParams, unknown>({
  authentication: true,
  params: {
    datasetId: { type: "uuid" },
    limit: {
      type: "number",
      integer: true,
      min: 1,
      max: MAX_LIMIT,
      optional: true,
      default: DEFAULT_LIMIT,
    },
  },

  async handler(ctx: AuthenticatedContext<SampleDataParams>) {
    const { datasetId, limit = DEFAULT_LIMIT } = ctx.params;
    await ctx.call("dataset.getDataset", { id: datasetId });
    const repo = dataSource.getRepository(DataRecord);

    const results = await repo
      .createQueryBuilder("r")
      .select("r.data")
      .where("r.datasetId = :datasetId", { datasetId })
      .orderBy("r.id", "ASC")
      .limit(Math.min(limit, MAX_LIMIT))
      .getRawMany();

    return {
      results: results.map((r) => r.r_data || r.data),
      count: results.length,
    };
  },
});
