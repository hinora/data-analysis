/**
 * Evaluation CLI Entry Point
 *
 * Standalone script that runs all evaluation fixtures against the real AI
 * adapter (no mocks). The AI provider is configured via the same environment
 * variables used by the production microservice (AI_PROVIDER, GEMINI_API_KEY,
 * OLLAMA_URL, etc.).
 *
 * Database: by default uses the test database on port 5433. Override with
 * `ANALYSIS_DB_URI` to target any PostgreSQL instance.
 *
 * Usage:
 *   docker compose up -d postgres-test
 *   npm run eval:agent
 *
 * Or with a custom DB:
 *   ANALYSIS_DB_URI=postgresql://... npm run eval:agent
 */

// Set the DB URI before any module that reads it is imported.
// This assignment must happen before the dynamic imports below.
if (!process.env.ANALYSIS_DB_URI) {
  process.env.ANALYSIS_DB_URI =
    process.env.TEST_PG_URI ??
    "postgresql://postgres:postgres@localhost:5433/postgres";
}

async function main(): Promise<void> {
  // Dynamic imports ensure the env var above is applied before the db
  // module initialises its DataSource with the connection string.
  const [
    { dataSource },
    { default: sendMessageAction },
    { ALL_FIXTURES },
    { runEvaluation },
    { printReport, writeJsonReport },
  ] = await Promise.all([
    import("../db"),
    import("../services/chat/sendMessage.action"),
    import("./fixtures"),
    import("./runner"),
    import("./report"),
  ]);

  await dataSource.initialize();

  try {
    const report = await runEvaluation({
      dataSource,
      fixtures: ALL_FIXTURES,
      sendMessageHandler: sendMessageAction.handler,
    });

    printReport(report);
    writeJsonReport(report);

    if (report.failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    await dataSource.destroy();
  }
}

main().catch((err: unknown) => {
  console.error("Evaluation failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
