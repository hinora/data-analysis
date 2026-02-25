#!/usr/bin/env node

/**
 * Generate Action Types for All Microservices
 *
 * Scans apps folder and generates types for each microservice
 *
 * Usage: npx ts-node lib/codegen/generate-all.ts
 */

// biome-ignore lint/style/useNodejsImportProtocol: ignore
import { execSync } from "child_process";
// biome-ignore lint/style/useNodejsImportProtocol: ignore
import * as fs from "fs";
// biome-ignore lint/style/useNodejsImportProtocol: ignore
import * as path from "path";

const ROOT_DIR = path.resolve(__dirname, "../..");
const APPS_DIR = path.join(ROOT_DIR, "apps");

interface MicroserviceInfo {
  name: string;
  path: string;
  servicesPath: string;
  outputPath: string;
}

/**
 * Find all microservices in the apps folder
 * Structure: apps/{domain}/{microservice}/services
 */
function findMicroservices(): MicroserviceInfo[] {
  const microservices: MicroserviceInfo[] = [];

  if (!fs.existsSync(APPS_DIR)) {
    console.error(`Apps directory not found: ${APPS_DIR}`);
    return microservices;
  }

  // Scan domain folders
  const domainDirs = fs.readdirSync(APPS_DIR, { withFileTypes: true });

  for (const domainDir of domainDirs) {
    if (!domainDir.isDirectory()) continue;

    const domainPath = path.join(APPS_DIR, domainDir.name);
    const microserviceDirs = fs.readdirSync(domainPath, {
      withFileTypes: true,
    });

    for (const msDir of microserviceDirs) {
      if (!msDir.isDirectory()) continue;

      const msPath = path.join(domainPath, msDir.name);
      const servicesPath = path.join(msPath, "services");

      // Only include if it has a services folder
      if (fs.existsSync(servicesPath)) {
        microservices.push({
          name: msDir.name,
          path: msPath,
          servicesPath,
          outputPath: path.join(msPath, "__generated__"),
        });
      }
    }
  }

  return microservices;
}

/**
 * Generate types for a single microservice
 */
function generateForMicroservice(ms: MicroserviceInfo): boolean {
  const scriptPath = path.join(
    ROOT_DIR,
    "lib/codegen/generate-action-types.ts",
  );
  const relativePath = path.relative(ROOT_DIR, ms.path);

  try {
    console.log(`\n📦 ${ms.name}`);
    console.log(`   Path: ${relativePath}`);

    execSync(
      `npx ts-node "${scriptPath}" "${ms.servicesPath}" "${ms.outputPath}"`,
      {
        cwd: ROOT_DIR,
        stdio: "pipe",
        encoding: "utf-8",
      },
    );

    console.log(`   ✅ Generated types successfully`);
    return true;
  } catch (error) {
    console.error(`   ❌ Failed to generate types`);
    if (error instanceof Error) {
      console.error(`   Error: ${error.message}`);
    }
    return false;
  }
}

/**
 * Main function
 */
function main() {
  console.log("🔍 Scanning for microservices...\n");

  const microservices = findMicroservices();

  if (microservices.length === 0) {
    console.log("⚠️  No microservices found with services folder");
    return;
  }

  console.log(`Found ${microservices.length} microservice(s):`);
  microservices.forEach((ms) => {
    console.log(`   - ${ms.name}`);
  });

  console.log(`\n  =`.repeat(50));
  console.log("Generating action types...");
  console.log("=".repeat(50));

  let successCount = 0;
  let failCount = 0;

  for (const ms of microservices) {
    if (generateForMicroservice(ms)) {
      successCount++;
    } else {
      failCount++;
    }
  }

  // Generate global types
  console.log(`\n  =`.repeat(50));
  console.log("Generating global types...");
  console.log("=".repeat(50));

  try {
    const globalScriptPath = path.join(
      ROOT_DIR,
      "lib/codegen/generate-global-types.ts",
    );
    execSync(`npx ts-node "${globalScriptPath}"`, {
      cwd: ROOT_DIR,
      stdio: "inherit",
    });
  } catch (_error) {
    console.error("❌ Failed to generate global types");
  }

  console.log(`\n  =`.repeat(50));
  console.log(`✅ Success: ${successCount}`);
  if (failCount > 0) {
    console.log(`❌ Failed: ${failCount}`);
  }
  console.log("=".repeat(50));
}

main();
