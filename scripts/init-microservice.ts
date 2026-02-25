#!/usr/bin/env npx ts-node
/**
 * Initialize a new microservice
 *
 * Usage:
 *   npx ts-node scripts/init-microservice.ts <domain> <microservice> [service1,service2,...]
 *
 * Examples:
 *   npx ts-node scripts/init-microservice.ts order order
 *   npx ts-node scripts/init-microservice.ts user user profile,settings
 *   npm run init:microservice -- user user profile,settings
 */

// biome-ignore lint/style/useNodejsImportProtocol: ignore
import * as fs from "fs";
// biome-ignore lint/style/useNodejsImportProtocol: ignore
import * as path from "path";

const ROOT_DIR = path.resolve(__dirname, "..");
const APPS_DIR = path.join(ROOT_DIR, "apps");

interface MicroserviceConfig {
  domain: string;
  microservice: string;
  services: string[];
}

function parseArgs(): MicroserviceConfig {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log(`
Usage: npx ts-node scripts/init-microservice.ts <domain> <microservice> [services]

Arguments:
  domain        Domain name (e.g., "order", "user", "payment")
  microservice  Microservice name (e.g., "order", "user")
  services      Comma-separated list of services (optional, defaults to microservice name)

Examples:
  npx ts-node scripts/init-microservice.ts order order
  npx ts-node scripts/init-microservice.ts user user profile,settings
  npm run init:microservice -- payment payment transaction,refund
`);
    process.exit(1);
  }

  const domain = args[0];
  const microservice = args[1];
  const services = args[2]
    ? args[2].split(",").map((s) => s.trim())
    : [microservice];

  return { domain, microservice, services };
}

function toPascalCase(str: string): string {
  return str
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}

function createPackageJson(config: MicroserviceConfig): string {
  return `{
  "name": "microservice.${config.microservice}",
  "version": "1.0.0",
  "scripts": {
    "dev": "nodemon --watch . --watch ../../../lib --ext ts,json --exec ts-node app.ts",
    "build": "tsc",
    "start": "node dist/app.js",
    "generate:types": "npm run generate:types --prefix ../../../ -- --microservice microservice.${config.microservice}"
  },
  "dependencies": {
    "core.lib": "file:../../../lib"
  }
}
`;
}

function createTsConfig(): string {
  return `{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "types": ["node"],
    "outDir": "./dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true,
    "moduleResolution": "node",
    "ignoreDeprecations": "5.0"
  },
  "include": ["./**/*"],
  "exclude": ["node_modules", "dist"]
}
`;
}

function createAppTs(config: MicroserviceConfig): string {
  return `/**
 * ${toPascalCase(config.microservice)} Microservice
 */
import "dotenv/config";
import { createApp, run } from "core.lib/broker";
import createConfig from "./moleculer.config";

// Create config fresh each time (picks up latest defaults)
const config = createConfig();

const app = createApp(config);
run(app.broker);
`;
}

function createMoleculerConfig(config: MicroserviceConfig): string {
  return `import { createNodeConfig } from "core.lib/config";
import * as path from "path";

export default () =>
  createNodeConfig("${config.microservice}", {
    servicesPath: path.join(__dirname, "services"),
  });
`;
}

function createEnvFile(): string {
  return `NODE_ENV=development
`;
}

function createActionFile(serviceName: string, actionName: string): string {
  const pascalService = toPascalCase(serviceName);
  const pascalAction = toPascalCase(actionName);

  return `/**
 * ${pascalAction} ${pascalService} Action
 */
import { defineAction } from "core.lib/broker";
import type { TypedContext } from "core.lib/__generated__";

export interface ${pascalAction}${pascalService}Params {
  // TODO: Define params
  id?: string;
}

export interface ${pascalAction}${pascalService}Result {
  // TODO: Define result
  success: boolean;
  message: string;
}

export default defineAction<${pascalAction}${pascalService}Params, ${pascalAction}${pascalService}Result>({
  params: {
    id: { type: "string", optional: true },
  },

  async handler(ctx: TypedContext<${pascalAction}${pascalService}Params>) {
    const { id } = ctx.params;

    // TODO: Implement action logic
    console.log(\`${serviceName}.${actionName} called with id: \${id}\`);

    return {
      success: true,
      message: "${serviceName}.${actionName} completed",
    };
  },
});
`;
}

function createDirectory(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`   📁 Created: ${path.relative(ROOT_DIR, dirPath)}`);
  }
}

function createFile(filePath: string, content: string): void {
  if (fs.existsSync(filePath)) {
    console.log(`   ⚠️  Skipped (exists): ${path.relative(ROOT_DIR, filePath)}`);
    return;
  }
  fs.writeFileSync(filePath, content);
  console.log(`   📄 Created: ${path.relative(ROOT_DIR, filePath)}`);
}

function main(): void {
  const config = parseArgs();

  console.log(`
🚀 Initializing Microservice
   Domain: ${config.domain}
   Microservice: ${config.microservice}
   Services: ${config.services.join(", ")}
`);

  const domainPath = path.join(APPS_DIR, `domain.${config.domain}`);
  const msPath = path.join(domainPath, `microservice.${config.microservice}`);
  const servicesPath = path.join(msPath, "services");

  // Check if already exists
  if (fs.existsSync(msPath)) {
    console.log(
      `⚠️  Microservice already exists at: ${path.relative(ROOT_DIR, msPath)}`,
    );
    console.log(`   Adding missing files only...\n`);
  }

  // Create directories
  console.log("📁 Creating directories...");
  createDirectory(domainPath);
  createDirectory(msPath);
  createDirectory(servicesPath);

  // Create base files
  console.log("\n📄 Creating base files...");
  createFile(path.join(msPath, "package.json"), createPackageJson(config));
  createFile(path.join(msPath, "tsconfig.json"), createTsConfig());
  createFile(path.join(msPath, "app.ts"), createAppTs(config));
  createFile(
    path.join(msPath, "moleculer.config.ts"),
    createMoleculerConfig(config),
  );
  createFile(path.join(msPath, ".env"), createEnvFile());

  // Create service folders and example actions
  console.log("\n📄 Creating services...");
  for (const service of config.services) {
    const servicePath = path.join(servicesPath, service);
    createDirectory(servicePath);

    // Create example actions: create, list
    createFile(
      path.join(servicePath, "create.action.ts"),
      createActionFile(service, "create"),
    );
    createFile(
      path.join(servicePath, "list.action.ts"),
      createActionFile(service, "list"),
    );
  }

  console.log(`
✅ Microservice initialized successfully!

📍 Location: apps/domain.${config.domain}/microservice.${config.microservice}/

Next steps:
  1. Install dependencies:
     npm install

  2. Generate types:
     npm run generate:types:all

  3. Start development:
     npm run dev -w microservice.${config.microservice}

  4. Customize your actions in:
     apps/domain.${config.domain}/microservice.${config.microservice}/services/
`);
}

main();
