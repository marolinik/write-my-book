/** Interface for all storage backends (S3, MinIO, local filesystem). */
export interface StorageAdapter {
  /** Read file content as UTF-8 string. Returns null if not found. */
  read(path: string): Promise<string | null>;

  /** Read file as raw Buffer. Returns null if not found. */
  readBuffer(path: string): Promise<Buffer | null>;

  /** Write string content to a file. Creates or overwrites. */
  write(path: string, content: string): Promise<void>;

  /** Write raw buffer to a file. Creates or overwrites. */
  writeBuffer(path: string, content: Buffer, contentType?: string): Promise<void>;

  /** Delete a file. No-op if not found. */
  delete(path: string): Promise<void>;

  /** Check if a file exists. */
  exists(path: string): Promise<boolean>;

  /** List files matching an optional glob pattern. */
  list(pattern?: string): Promise<string[]>;

  /** Create a directory (no-op for S3). */
  mkdir(path?: string): Promise<void>;
}
