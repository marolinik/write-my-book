import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const FILES = ["docker-compose.yml", "docker-compose.prod.yml", "docker/db-backup/Dockerfile"];
const PINNED = /ghcr\.io\/marolinik\/wmb-(minio|mc)@sha256:[0-9a-f]{64}/;

function minioImageLines(): string[] {
  return FILES.flatMap((file) =>
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^(image:|FROM\s)/.test(line) && /minio|wmb-mc/.test(line)),
  );
}

describe("object store images", () => {
  it("MinIO images are pinned to a registry we control", () => {
    const lines = minioImageLines();
    expect(lines.length).toBeGreaterThanOrEqual(4);
    for (const line of lines) expect(line).toMatch(PINNED);
  });
});
