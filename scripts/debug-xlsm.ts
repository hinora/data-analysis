/**
 * Debug script to test XLSM parser with the actual file
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { XlsmParser } from "../lib/adapters/file-parser/xlsm.parser";

const filePath = path.resolve(
  process.cwd(),
  "apps/domain.data/microservice.data/data/uploads/0cd94961-d8c4-42fc-8b27-d0e80f2b2bfa/8750caa569d5007dddb78544dac00fd6a09c28ec903c871b2f3213a60317a21f-BÁO CÁO KOMEX.xlsx",
);

async function main() {
  console.log("Reading:", filePath);
  const buffer = fs.readFileSync(filePath);
  const parser = new XlsmParser();
  const result = await parser.parse({ buffer, filename: "BÁO CÁO KOMEX.xlsx" });

  console.log(`\nErrors: ${result.errors.length}`);
  for (const err of result.errors) {
    console.log(`  [${err.severity}] ${err.message}`);
  }

  console.log(`\nDatasets: ${result.datasets.length}`);
  for (const ds of result.datasets) {
    console.log(`\n--- ${ds.name} ---`);
    console.log(`  Type: ${ds.datasetType}`);
    console.log(
      `  Sheet: ${ds.sheetName}, Table: ${ds.tablePosition ?? "N/A"}`,
    );
    console.log(`  Rows: ${ds.rows?.length ?? 0}`);
    console.log(`  Columns (${ds.columnMappings?.length ?? 0}):`);
    for (const col of ds.columnMappings ?? []) {
      console.log(
        `    [${col.order}] "${col.original}" → ${col.camelCase} (${col.detectedType})`,
      );
    }
    if (ds.rows && ds.rows.length > 0) {
      console.log(`  First row:`, JSON.stringify(ds.rows[0]).slice(0, 200));
    }
  }
}

main().catch(console.error);
