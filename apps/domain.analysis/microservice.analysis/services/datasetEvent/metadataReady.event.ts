/**
 * Dataset Metadata Ready Event Handler
 *
 * Listens for datasetEvent.metadataReady events from microservice.data.
 * On the first dataset metadata completion, generates an AI-based session name
 * from the dataset names in the session.
 */

import type { TypedContext } from "core.lib/__generated__";
import { defineEvent } from "core.lib/broker";
import { dataSource } from "../../db";
import { Session } from "../../db/session.entity";

export interface DatasetMetadataReadyPayload {
  datasetId: string;
  sessionId: string;
  name: string;
}

export default defineEvent<DatasetMetadataReadyPayload>({
  group: "analysis-workers",

  async handler(ctx: TypedContext<DatasetMetadataReadyPayload>) {
    const { datasetId, sessionId, name } = ctx.params;

    ctx.broker.logger.info(
      `[analysis] Metadata ready for dataset "${name}" (${datasetId}) in session ${sessionId}`,
    );

    // Auto-rename session if it still has the default generated name
    try {
      const sessionRepo = dataSource.getRepository(Session);
      const session = await sessionRepo.findOneBy({ id: sessionId });

      if (!session) return;

      // Only rename if the session name is still the auto-generated default
      const isDefaultName = session.name.startsWith("Session —");
      if (!isDefaultName) return;

      // Gather all dataset names in this session
      const datasets = (await ctx.call("dataset.listDatasets", {
        sessionId,
      })) as Array<{ datasetType: string; name: string }>;

      const datasetContext = datasets
        .map((d) => `${d.name} (${d.datasetType})`)
        .join(", ");

      const { name: generatedName } = await ctx.call(
        "chat.generateName",
        {
          context: `Datasets: ${datasetContext}`,
          target: "session" as const,
        },
        { timeout: 120000 },
      );

      await ctx.call("session.renameSession", {
        id: sessionId,
        name: generatedName,
      });

      ctx.broker.logger.info(
        `[analysis] Session ${sessionId} renamed to "${generatedName}"`,
      );
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      ctx.broker.logger.warn(
        `[analysis] Failed to auto-rename session ${sessionId}: ${errMsg}`,
      );
    }
  },
});
