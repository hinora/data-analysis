/**
 * Dataset Metadata Ready Event Handler
 *
 * Listens for datasetEvent.metadataReady events from microservice.data.
 * Can update session-level metadata state if needed.
 */

import type { TypedContext } from "core.lib/__generated__";
import { defineEvent } from "core.lib/broker";

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

    // Future: update session-level aggregated metadata state
  },
});
