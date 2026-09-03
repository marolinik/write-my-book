import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import IORedis from "ioredis";
import { envHealth } from "@/lib/env";
import { verifyNeo4jConnection } from "@/lib/graph/neo4j-client";
import { verifyQdrantConnection } from "@/lib/vector/qdrant-client";


export type DependencyStatus = "ok" | "degraded" | "error" | "skipped";

export interface DependencyCheckResult {
  name: string;
  status: DependencyStatus;
  required: boolean;
  latencyMs: number;
  message: string;
}

export interface DependencyReadinessResult {
  ok: boolean;
  status: "ready" | "degraded";
  checkedAt: string;
  dependencies: DependencyCheckResult[];
}

type CheckFn = () => Promise<void>;

const CHECK_TIMEOUT_MS = 3_000;

function nowMs() {
  return Date.now();
}

function sanitizeMessage(error: unknown): string {
  if (!(error instanceof Error) || !error.message) return "Dependency check failed";
  if (process.env.NODE_ENV === "production") {
    // H3: raw driver errors echo internal host:port pairs ("connect
    // ECONNREFUSED 10.0.x.y:6379"). Untrusted production callers see
    // classification only; operators get first lines in the server logs
    // and, with HEALTH_TOKEN, in the authorized response path.
    return /timed out/i.test(error.message) ? "check timed out" : "check failed";
  }
  return error.message.split("\n")[0].slice(0, 180);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs = CHECK_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function runCheck(
  name: string,
  required: boolean,
  check: CheckFn
): Promise<DependencyCheckResult> {
  const started = nowMs();
  try {
    await withTimeout(check());
    return {
      name,
      required,
      status: "ok",
      latencyMs: nowMs() - started,
      message: "ok",
    };
  } catch (error) {
    return {
      name,
      required,
      status: required ? "error" : "degraded",
      latencyMs: nowMs() - started,
      message: sanitizeMessage(error),
    };
  }
}

function isConfigured(...keys: string[]) {
  return keys.every((key) => Boolean(process.env[key]?.trim()));
}

// db-reaching checks import their module LAZILY. `@/lib/db` runs the
// fail-closed assertEnvReady("web") at module scope, and this route must be
// able to LOAD (and report) a bad env as a structured 503 — not crash with a
// bare 500 while evaluating the module graph. Real consumers (API routes,
// worker) still import db eagerly and keep the fail-closed guarantee.
async function checkDatabase() {
  const { db } = await import("@/lib/db");
  await db.$queryRaw`SELECT 1`;
}

async function checkRedis() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) throw new Error("REDIS_URL is not configured");

  const redis = new IORedis(redisUrl, {
    lazyConnect: true,
    connectTimeout: CHECK_TIMEOUT_MS,
    maxRetriesPerRequest: 1,
    enableReadyCheck: false,
  });

  try {
    await redis.connect();
    const pong = await redis.ping();
    if (pong !== "PONG") throw new Error("Unexpected Redis ping response");
  } finally {
    redis.disconnect();
  }
}

async function checkS3() {
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!bucket || !accessKeyId || !secretAccessKey) {
    throw new Error("S3 bucket or credentials are not configured");
  }

  const client = new S3Client({
    region: process.env.S3_REGION ?? "us-east-1",
    credentials: { accessKeyId, secretAccessKey },
    ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT } : {}),
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  });

  await client.send(new HeadBucketCommand({ Bucket: bucket }));
}

async function optionalCheck(
  name: string,
  configured: boolean,
  check: CheckFn
): Promise<DependencyCheckResult> {
  if (!configured) {
    return {
      name,
      required: false,
      status: "skipped",
      latencyMs: 0,
      message: "not configured",
    };
  }
  return runCheck(name, false, check);
}

// H3 DoS hardening: each real check opens ~6 outbound probes (DB, schema
// ×4 information_schema, Redis, S3, Qdrant, Neo4j). Uncached anonymous
// hits would multiply that into a pool-exhaustion flood, so results are
// cached briefly and concurrent callers collapse onto one in-flight run.
const CACHE_MS = 15_000;
let cached: { expiresAt: number; value: DependencyReadinessResult } | null = null;
let inflight: Promise<DependencyReadinessResult> | null = null;

/** Drop the readiness cache (tests / forced recheck after remediation). */
export function resetDependencyCheckCache() {
  cached = null;
}

export async function checkDependencies(): Promise<DependencyReadinessResult> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (inflight) return inflight;
  inflight = (async () => {
    const result = await runDependencyChecks();
    cached = { expiresAt: Date.now() + CACHE_MS, value: result };
    return result;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function runDependencyChecks(): Promise<DependencyReadinessResult> {
  const env = envHealth("web");
  const checks = await Promise.all([
    Promise.resolve({
      name: "environment",
      required: true,
      status: env.ok ? "ok" : "error",
      latencyMs: 0,
      message: env.ok ? "ok" : "Invalid runtime environment",
    } satisfies DependencyCheckResult),
    runCheck("postgres", true, checkDatabase),
    // A bare `SELECT 1` stays green against a STALE schema. This asserts the
    // release's required objects actually exist → readiness 503 on drift.
    runCheck("schema", true, async () => {
      const { assertSchemaContract } = await import("@/lib/health/schema-contract");
      await assertSchemaContract();
    }),
    runCheck("redis", true, checkRedis),
    runCheck("s3", true, checkS3),
    // Worker is a HARD deploy requirement: without a consumer, every background
    // AI workflow hangs silently. Required → readiness returns 503 on worker-down.
    runCheck("worker", true, async () => {
      const { assertWorkerLiveness } = await import("@/lib/health/worker-liveness");
      await assertWorkerLiveness();
    }),
    optionalCheck("qdrant", isConfigured("QDRANT_URL"), async () => {
      const ok = await verifyQdrantConnection();
      if (!ok) throw new Error("Qdrant connection failed");
    }),
    optionalCheck("neo4j", isConfigured("NEO4J_URI"), async () => {
      const ok = await verifyNeo4jConnection();
      if (!ok) throw new Error("Neo4j connection failed");
    }),
  ]);

  const ok = checks.every((check) => !check.required || check.status === "ok");
  return {
    ok,
    status: ok ? "ready" : "degraded",
    checkedAt: new Date().toISOString(),
    dependencies: checks,
  };
}
