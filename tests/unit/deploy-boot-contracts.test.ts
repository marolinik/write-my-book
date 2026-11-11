// P1-17 / P1-20 / P1-19: the worker crashed at boot with its documented env
// (db.ts asserted the WEB env at import time); Neo4j constraints were never
// created (initGraphSchema had no caller); readiness checked four July
// objects while every later schema addition production owed went unguarded.
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSchemaContract } from "../../scripts/schema-contract-parse";
import { REQUIRED_SCHEMA_OBJECTS } from "@/lib/health/schema-contract";

const ROOT = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf-8");

const WORKER_ENV = {
  DATABASE_URL: "postgresql://u:p@db.internal:5432/wmb",
  API_KEY_ENCRYPTION_SECRET: "x".repeat(64),
  REDIS_URL: "redis://redis:6379",
  S3_ENDPOINT: "http://minio:9000",
  S3_ACCESS_KEY_ID: "wmbaccess",
  S3_SECRET_ACCESS_KEY: "wmbsecretkey123",
  S3_BUCKET: "wmb-projects",
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("the worker boots on its own env (P1-17)", () => {
  it("importing @/lib/db with only the worker env in production does not throw", async () => {
    vi.resetModules();
    for (const key of ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY", "STRIPE_SECRET_KEY", "NEXT_PUBLIC_APP_URL"]) {
      vi.stubEnv(key, "");
    }
    for (const [key, value] of Object.entries(WORKER_ENV)) vi.stubEnv(key, value);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CI", "");
    vi.stubEnv("WMB_RUNTIME_TARGET", "worker");
    await expect(import("@/lib/db")).resolves.toBeDefined();
  });

  it("the worker sets its runtime target before anything imports the database", () => {
    const worker = read("src", "worker.ts");
    const firstImport = worker.split("\n").find((line) => line.startsWith("import "));
    expect(firstImport).toContain("./worker-env");
  });
});

describe("the graph gets its schema (P1-20)", () => {
  it("the worker creates the Neo4j constraints at boot, after its env check", () => {
    const worker = read("src", "worker.ts");
    expect(worker.indexOf("initGraphSchema(")).toBeGreaterThan(worker.indexOf('assertEnvReady("worker")'));
  });

  it("an operator can run it by hand", () => {
    expect(JSON.parse(read("package.json")).scripts["graph:init"]).toBeTruthy();
  });
});

describe("readiness checks every table and column (P1-19)", () => {
  const parsed = parseSchemaContract(read("prisma", "schema.prisma"));

  it("the contract is generated from schema.prisma and is current", () => {
    expect(REQUIRED_SCHEMA_OBJECTS.map((o) => o.label).sort()).toEqual(parsed.map((o) => o.label).sort());
  });

  it("covers the objects production owes from the last waves", () => {
    const labels = new Set(parsed.map((o) => o.label));
    for (const label of [
      "usage_records.key_source",
      "usage_records.book_id",
      "subscriptions.pending_checkout_session_id",
      "account_erasures.done_stores",
      "books.archived_at",
    ]) {
      expect(labels.has(label)).toBe(true);
    }
  });

  it("does not treat relation fields as columns", () => {
    expect(parsed.find((o) => o.label === "usage_records.book")).toBeUndefined();
  });
});
