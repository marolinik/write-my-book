import { S3Client } from "@aws-sdk/client-s3";
import { S3StorageAdapter } from "./s3-adapter";
import type { StorageAdapter } from "./types";

export type { StorageAdapter };

let _s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!_s3Client) {
    const endpoint = process.env.S3_ENDPOINT;
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
    const region = process.env.S3_REGION ?? "us-east-1";
    const forcePathStyle = process.env.S3_FORCE_PATH_STYLE === "true";

    if (!accessKeyId || !secretAccessKey) {
      throw new Error("S3 credentials not configured");
    }

    _s3Client = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
      ...(endpoint && { endpoint }),
      forcePathStyle,
    });
  }
  return _s3Client;
}

/**
 * Get a storage adapter scoped to a given S3 prefix (e.g. userId/bookId).
 */
export function getStorage(s3Prefix: string): StorageAdapter {
  const bucket = process.env.S3_BUCKET ?? "wmb-projects";
  return new S3StorageAdapter(bucket, s3Prefix, getS3Client());
}

/**
 * Get a storage adapter for a book.
 */
export function getBookStorage(userId: string, bookId: string): StorageAdapter {
  return getStorage(`${userId}/${bookId}`);
}

/**
 * Get a storage adapter for series-level documents.
 */
export function getSeriesStorage(
  userId: string,
  seriesId: string
): StorageAdapter {
  return getStorage(`${userId}/${seriesId}/series`);
}
