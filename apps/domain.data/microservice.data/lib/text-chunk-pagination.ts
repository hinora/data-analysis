import type { Repository } from "typeorm";
import type { TextChunk } from "../db/text-chunk.entity";

export const DEFAULT_TEXT_CHUNK_PAGE_SIZE = 100;

export interface ScanTextChunkPagesRequest {
  chunkRepo: Repository<TextChunk>;
  datasetId: string;
  onPage: (req: {
    chunks: TextChunk[];
    page: number;
    totalChunks: number;
  }) => Promise<void>;
  pageSize?: number;
}

export interface ScanTextChunkPagesResult {
  totalChunks: number;
}

export async function scanTextChunkPages(
  req: ScanTextChunkPagesRequest,
): Promise<ScanTextChunkPagesResult> {
  const {
    chunkRepo,
    datasetId,
    onPage,
    pageSize = DEFAULT_TEXT_CHUNK_PAGE_SIZE,
  } = req;

  const totalChunks = await chunkRepo.count({ where: { datasetId } });

  for (let page = 0; page * pageSize < totalChunks; page++) {
    const chunks = await chunkRepo.find({
      order: { orderIndex: "ASC" },
      skip: page * pageSize,
      take: pageSize,
      where: { datasetId },
    });

    if (chunks.length === 0) {
      break;
    }

    await onPage({ chunks, page, totalChunks });
  }

  return { totalChunks };
}
