import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import IORedis from "ioredis";
import { db } from "@/lib/db";
import { envHealth } from "@/lib/env";
import { verifyNeo4jConnection } from "@/lib/graph/neo4j-client";
import { verifyQdrantConnection } from "@/lib/vector/qdrant-client";
import { assertWorkerLiveness } from "@/lib/health/worker-liveness";
import { assertSchemaContract } from "@/lib/health/schema-contract";

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
  if (error instanceof Error && error.message) {
    return error.message.split("\n")[0].slice(0, 180);
  }
  return "Dependency check failed";
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

async function checkDatabase() {
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

export async function checkDependencies(): Promise<DependencyReadinessResult> {
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
    runCheck("schema", true, assertSchemaContract),
    runCheck("redis", true, checkRedis),
    runCheck("s3", true, checkS3),
    // Worker is a HARD deploy requirement: without a consumer, every background
    // AI workflow hangs silently. Required → readiness returns 503 on worker-down.
    runCheck("worker", true, assertWorkerLiveness),
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
