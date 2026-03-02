/**
 * Session Deleted Event Handler
 *
 * Cascade-deletes all data belonging to a deleted session:
 * datasets, data records, text chunks, original files, and AI logs.
 * Also removes uploaded files from disk.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { TypedContext } from "core.lib/__generated__";
import { defineEvent } from "core.lib/broker";
import { AILog } from "core.lib/database";
import { dataSource } from "../../db";
import { DataRecord } from "../../db/data-record.entity";
import { Dataset } from "../../db/dataset.entity";
import { OriginalFile } from "../../db/original-file.entity";
import { TextChunk } from "../../db/text-chunk.entity";

export interface SessionDeletedPayload {
  sessionId: string;
}

const UPLOAD_DIR =
  process.env.UPLOAD_DIR || path.resolve(process.cwd(), "../../data/uploads");

export default defineEvent<SessionDeletedPayload>({
  group: "data-workers",

  async handler(ctx: TypedContext<SessionDeletedPayload>) {
    const { sessionId } = ctx.params;

    ctx.broker.logger.info(
      `[data] Handling sessionData.sessionDeleted for session ${sessionId}`,
    );

    // Delete in order: records → chunks → datasets → files → logs
    // (TypeORM cascades handle most of this, but we do it explicitly for clarity)

    await dataSource.getRepository(DataRecord).delete({ sessionId });
    await dataSource.getRepository(TextChunk).delete({ sessionId });
    await dataSource.getRepository(Dataset).delete({ sessionId });
    await dataSource.getRepository(OriginalFile).delete({ sessionId });
    await dataSource.getRepository(AILog).delete({ sessionId });

    // Remove session upload directory from disk
    const sessionDir = path.join(UPLOAD_DIR, sessionId);
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }

    ctx.broker.logger.info(
      `[data] Cascade deletion complete for session ${sessionId}`,
    );
  },
});
