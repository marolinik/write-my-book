// P2-35 / P2-36 / P2-44 / P2-75: hot queries filtered unindexed columns (the
// managed-tier spend aggregate runs on every agent start), the pg pool ran on
// library defaults with no statement timeout, store clients could hang for
// 300 s, and a version snapshot upload ran inside a 5 s interactive
// transaction.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf-8");
const schema = read("prisma", "schema.prisma");

function model(name: string): string {
  return schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? "";
}

describe("indexes on the hot tables (P2-35)", () => {
  it.each([
    ["UsageRecord", "[userId, recordedAt]"],
    ["UsageRecord", "[bookId, recordedAt]"],
    ["AgentSession", "[bookId, status]"],
    ["AgentSession", "[userId, status, completedAt]"],
    ["EditAction", "[bookId, chapterNumber, timestamp]"],
    ["BookNotification", "[bookId]"],
    ["SessionBrief", "[userId]"],
    ["SharedSnapshot", "[createdById]"],
    ["Series", "[userId]"],
    ["Document", "[seriesId]"],
    ["WriterMemory", "[findingId]"],
  ])("%s has @@index(%s)", (name, fields) => {
    expect(model(name)).toContain(`@@index(${fields})`);
  });
});

describe("bounded pools and store calls (P2-36, P2-44)", () => {
  it("the pg pool has a size, connect timeout, idle timeout and statement timeout", () => {
    const db = read("src", "lib", "db.ts");
    for (const option of ["max:", "connectionTimeoutMillis:", "idleTimeoutMillis:", "statement_timeout"]) {
      expect(db).toContain(option);
    }
  });

  it("the Qdrant client times out within 10 s", () => {
    expect(read("src", "lib", "vector", "qdrant-client.ts")).toMatch(/timeout: 10_000/);
  });

  it("the S3 client has connection and request timeouts", () => {
    const storage = read("src", "lib", "storage", "index.ts");
    expect(storage).toMatch(/connectionTimeout: \d/);
    expect(storage).toMatch(/requestTimeout: \d/);
  });

  it("the Neo4j driver gives up on a connection within 10 s", () => {
    const neo4j = read("src", "lib", "graph", "neo4j-client.ts");
    expect(neo4j).toMatch(/connectionAcquisitionTimeout: 10_000/);
    expect(neo4j).toMatch(/connectionTimeout: 10_000/);
  });
});

describe("version snapshots (P2-75)", () => {
  it("the version transaction has a timeout sized for a storage upload", () => {
    expect(read("src", "lib", "documents", "version-manager.ts")).toMatch(/\{ timeout: 30_000, maxWait: 10_000 \}/);
  });
});
