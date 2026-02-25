/**
 * File System Utilities
 *
 * Common file system operations for file uploads and storage.
 */

import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import type { Readable } from "node:stream";

/**
 * Ensure a directory exists, creating it recursively if needed
 */
export function ensureDir(req: { dir: string }): void {
  const { dir } = req;
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Save a readable stream to a file with size validation
 *
 * @param req.filePath - Full path where to save the file
 * @param req.maxSize - Maximum allowed file size in bytes
 * @param req.stream - Readable stream to save
 * @returns The filename (last part of the path)
 * @throws Error if file exceeds maxSize
 */
export async function saveStreamToFile(req: {
  filePath: string;
  maxSize: number;
  stream: Readable;
}): Promise<string> {
  const { filePath, maxSize, stream } = req;

  return new Promise((resolve, reject) => {
    const writeStream = createWriteStream(filePath);
    let fileSize = 0;

    stream.on("data", (chunk: Buffer) => {
      fileSize += chunk.length;
      if (fileSize > maxSize) {
        stream.destroy();
        writeStream.destroy();
        reject(
          new Error(
            `File too large. Maximum size is ${maxSize / 1024 / 1024}MB`,
          ),
        );
      }
    });

    stream.on("error", (err: Error) => {
      writeStream.destroy();
      reject(err);
    });

    writeStream.on("error", (err: Error) => {
      reject(err);
    });

    writeStream.on("finish", () => {
      // Return just the filename, not full path
      resolve(filePath.split("/").pop() || "");
    });

    stream.pipe(writeStream);
  });
}
