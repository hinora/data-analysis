/**
 * Jest Configuration
 *
 * Root configuration for the monorepo. Uses ts-jest for TypeScript support.
 * Tests can be placed anywhere matching the pattern *.test.ts.
 */

import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",

  testEnvironment: "node",

  // Match test files anywhere in the repo
  testMatch: ["<rootDir>/**/*.test.ts"],

  // Ignore build outputs and node_modules
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],

  // Allow 30 seconds per test for DB operations
  testTimeout: 30000,

  // Resolve core.lib imports the same way the app does (via workspace symlink)
  moduleNameMapper: {
    "^core\\.lib/__generated__$":
      "<rootDir>/lib/testing/stubs/generated-types.ts",
    "^core\\.lib/__generated__/(.*)$":
      "<rootDir>/lib/testing/stubs/generated-types.ts",
    "^core\\.lib/(.*)$": "<rootDir>/lib/$1",
    "^core\\.lib$": "<rootDir>/lib/index.ts",
  },

  // ts-jest configuration
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.test.json",
      },
    ],
  },

  // Collect coverage when requested
  coverageDirectory: "coverage",
  collectCoverageFrom: [
    "apps/**/*.ts",
    "lib/**/*.ts",
    "!**/*.d.ts",
    "!**/index.ts",
    "!**/node_modules/**",
    "!**/__generated__/**",
    // Exclude complex actions that require streaming/AI infrastructure
    "!**/sendMessage.action.ts",
    "!**/buildDynamicSystemPrompt.action.ts",
    // Exclude tool actions (require complex SQL/data setup)
    "!**/services/tools/*.action.ts",
    // Exclude upload/metadata event handlers (require file I/O)
    "!**/services/upload/**",
    "!**/services/metadata/**",
    // Exclude adapters that require external services
    "!**/adapters/ai/gemini.adapter.ts",
    "!**/adapters/ai/lmstudio.adapter.ts",
    "!**/adapters/ai/ollama.adapter.ts",
    "!**/adapters/file-parser/pdf.parser.ts",
    "!**/adapters/file-parser/csv.parser.ts",
    "!**/adapters/file-parser/xlsm.parser.ts",
    // Exclude app startup and infrastructure
    "!**/app.ts",
    "!**/runner.ts",
    "!**/createApp.ts",
    "!**/codegen/**",
    "!**/config/**",
    "!**/scripts/**",
    "!**/stubs/**",
    "!**/toolConfig.ts",
    "!**/lib/fs/**",
    "!**/lib/moleculer/**",
    "!**/lib/types/**",
    "!**/text-chunker.ts",
    // Exclude Moleculer configuration files
    "!**/moleculer.config.ts",
    // Exclude event handlers (separate from action testing)
    "!**/*.event.ts",
    // Exclude gateway service (requires full Moleculer runtime)
    "!**/gateway.service.ts",
    // Exclude adapter types (no logic)
    "!**/adapters/ai/types.ts",
    // Exclude lib utilities that need full infrastructure
  ],
};

export default config;
