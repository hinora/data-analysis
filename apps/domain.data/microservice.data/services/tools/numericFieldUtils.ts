/**
 * Numeric Field Utilities
 *
 * Shared helpers for tools that need to detect whether a JSONB field
 * contains numeric values before casting to ::numeric in SQL.
 */

import { Errors } from "moleculer";
import type { Repository } from "typeorm";
import type { DataRecord } from "../../db/data-record.entity";

const NUMERIC_REGEX = /^-?\d+(\.\d+)?$/;

/**
 * Samples one non-null value from a JSONB field and checks if it looks numeric.
 */
export async function isFieldNumeric(req: {
  datasetId: string;
  field: string;
  repo: Repository<DataRecord>;
}): Promise<boolean> {
  const { datasetId, field, repo } = req;

  const sample = await repo
    .createQueryBuilder("r")
    .select(`r.data->>'${field}'`, "val")
    .where("r.datasetId = :datasetId", { datasetId })
    .andWhere(`r.data->>'${field}' IS NOT NULL`)
    .limit(1)
    .getRawOne();

  return sample?.val != null && NUMERIC_REGEX.test(sample.val.trim());
}

/**
 * Asserts that the field is numeric, throwing a clear MoleculerClientError if not.
 * Use this in tools where the operation inherently requires numeric data (SUM, AVG, etc.).
 */
export async function assertFieldIsNumeric(req: {
  datasetId: string;
  field: string;
  repo: Repository<DataRecord>;
  toolName: string;
}): Promise<void> {
  const { datasetId, field, repo, toolName } = req;
  const numeric = await isFieldNumeric({ datasetId, field, repo });

  if (!numeric) {
    throw new Errors.MoleculerClientError(
      `Field '${field}' contains non-numeric values. The ${toolName} tool requires a numeric field.`,
      422,
      "NON_NUMERIC_FIELD",
      { field },
    );
  }
}
