import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import type { StorageAdapter } from "./types";

/** S3-compatible storage adapter (works with AWS S3, MinIO, R2). */
export class S3StorageAdapter implements StorageAdapter {
  constructor(
    private bucket: string,
    private prefix: string,
    private client: S3Client
  ) {}

  private key(path: string): string {
    const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "");
    return this.prefix ? `${this.prefix}/${normalized}` : normalized;
  }

  async read(path: string): Promise<string | null> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: this.key(path) })
      );
      return (await res.Body?.transformToString("utf-8")) ?? null;
    } catch (err: unknown) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async readBuffer(path: string): Promise<Buffer | null> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: this.key(path) })
      );
      const bytes = await res.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    } catch (err: unknown) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async write(path: string, content: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.key(path),
        Body: content,
        ContentType: "text/plain; charset=utf-8",
      })
    );
  }

  async writeBuffer(
    path: string,
    content: Buffer,
    contentType?: string
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.key(path),
        Body: content,
        ContentType: contentType ?? "application/octet-stream",
      })
    );
  }

  async delete(path: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: this.key(path) })
      );
    } catch (err: unknown) {
      if (!isNotFound(err)) throw err;
    }
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: this.key(path) })
      );
      return true;
    } catch (err: unknown) {
      if (isNotFound(err)) return false;
      throw err;
    }
  }

  async list(pattern?: string): Promise<string[]> {
    return (await this.listDetailed(pattern)).map((o) => o.key);
  }

  async listDetailed(pattern?: string): Promise<Array<{ key: string; lastModified: Date | null }>> {
    const results: Array<{ key: string; lastModified: Date | null }> = [];
    let continuationToken: string | undefined;
    const prefixKey = this.prefix ? `${this.prefix}/` : "";
    // P2-77: ask S3 only for the pattern's literal lead, not every object
    // under the book (version snapshots included).
    const listPrefix = prefixKey + (pattern ? literalPrefixOf(pattern) : "");

    do {
      const res = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: listPrefix,
          ContinuationToken: continuationToken,
        })
      );

      for (const obj of res.Contents ?? []) {
        if (!obj.Key) continue;
        const relative = obj.Key.startsWith(prefixKey)
          ? obj.Key.slice(prefixKey.length)
          : obj.Key;
        results.push({ key: relative, lastModified: obj.LastModified ?? null });
      }

      continuationToken = res.NextContinuationToken;
    } while (continuationToken);

    if (!pattern) return results;
    const regex = globToRegex(pattern);
    return results.filter((f) => regex.test(f.key));
  }

  async mkdir(): Promise<void> {
    // S3 has no directories — no-op
  }
}

function isNotFound(err: unknown): boolean {
  const code = (err as { name?: string })?.name;
  return (
    code === "NoSuchKey" ||
    code === "NotFound" ||
    code === "404" ||
    (err as { $metadata?: { httpStatusCode?: number } })?.$metadata
      ?.httpStatusCode === 404
  );
}

/** The part of a glob before its first wildcard, cut back to the last "/". */
export function literalPrefixOf(pattern: string): string {
  const wildcard = pattern.search(/[*?[]/);
  const lead = wildcard === -1 ? pattern : pattern.slice(0, wildcard);
  const slash = lead.lastIndexOf("/");
  return slash === -1 ? "" : lead.slice(0, slash + 1);
}

/** Convert a simple glob pattern to regex. Supports * and **. */
function globToRegex(pattern: string): RegExp {
  let regexStr = "^";
  let i = 0;
  while (i < pattern.length) {
    const char = pattern[i];
    if (char === "*") {
      if (pattern[i + 1] === "*") {
        regexStr += ".*";
        i += 2;
        if (pattern[i] === "/") i++;
        continue;
      }
      regexStr += "[^/]*";
    } else if (char === "?") {
      regexStr += "[^/]";
    } else if (".+^${}()|[]\\".includes(char!)) {
      regexStr += "\\" + char;
    } else {
      regexStr += char;
    }
    i++;
  }
  regexStr += "$";
  return new RegExp(regexStr);
}
