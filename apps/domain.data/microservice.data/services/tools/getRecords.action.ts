/**
 * Get Records Tool
 *
 * Retrieve rows from a structured-table dataset using a record range.
 * Returns a JSON array of records between fromRecord and toRecord
 * (0-based, exclusive end) so the AI can understand column formats,
 * data types, and representative values before performing analysis.
 */

import type { TypedContext } from "core.lib/__generated__";
import { defineAction } from "core.lib/broker";
import { Errors } from "moleculer";
import { dataSource } from "../../db";
import { DataRecord } from "../../db/data-record.entity";

const MAX_RANGE = 50;

export interface GetRecordsParams {
  datasetId: string;
  fromRecord: number;
  toRecord: number;
}

export default defineAction<GetRecordsParams, unknown>({
  params: {
    datasetId: { type: "uuid" },
    fromRecord: {
      type: "number",
      integer: true,
      min: 0,
    },
    toRecord: {
      type: "number",
      integer: true,
      min: 1,
    },
  },

  async handler(ctx: TypedContext<GetRecordsParams>) {
    const { datasetId, fromRecord, toRecord } = ctx.params;

    if (toRecord <= fromRecord) {
      throw new Errors.ValidationError(
        "toRecord must be greater than fromRecord",
      );
    }

    const range = toRecord - fromRecord;
    if (range > MAX_RANGE) {
      throw new Errors.ValidationError(
        `Range exceeds maximum of ${MAX_RANGE} records per request`,
      );
    }

    await ctx.call("dataset.getDataset", { id: datasetId });
    const repo = dataSource.getRepository(DataRecord);

    const results = await repo
      .createQueryBuilder("r")
      .select("r.data")
      .where("r.datasetId = :datasetId", { datasetId })
      .orderBy("r.id", "ASC")
      .offset(fromRecord)
      .limit(range)
      .getRawMany();

    return results.map((r) => r.r_data || r.data);
  },
});
