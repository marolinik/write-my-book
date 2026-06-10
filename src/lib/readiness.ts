import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import IORedis from "ioredis";
import neo4j from "neo4j-driver";
import pg from "pg";
import { envHealth } from "@/lib/env";

export type DependencyStatus = "ok" | "degraded" | "failed" | "skipped";

export interface DependencyCheckResult {
  name: string;
  status: DependencyStatus;
  required: boolean;
  latencyMs: number;
  message: string;
}

export interface ReadinessResult {
  ok: boolean;
  status: "ready" | "degraded" | "not_ready";
  checkedAt: string;
  env: ReturnType<typeof envHealth>;
  dependencies: DependencyCheckResult[];
}

type CheckFn = () => Promise<void>;

const DEFAULT_TIMEOUT_MS = 2_500;

function elapsed(started: number) {
  return Math.max(0, Date.now() - started);
}

function sanitizeError(error: unknown): string {
  if (error instanceof Error) return error.message.split("\n")[0]?.slice(0, 180) || error.name;
  return "Unknown error";
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function runCheck(name: string, required: boolean, fn: CheckFn): Promise<DependencyCheckResult> {
  const started = Date.now();
  try {
    await withTimeout(fn(), DEFAULT_TIMEOUT_MS, name);
    return { name, required, status: "ok", latencyMs: elapsed(started), message: "ok" };
  } catch (error) {
    return {
      name,
      required,
      status: required ? "failed" : "degraded",
      latencyMs: elapsed(started),
      message: sanitizeError(error),
    };
  }
}

function skipped(name: string, required: boolean, message: string): DependencyCheckResult {
  return { name, required, status: "skipped", latencyMs: 0, message };
}

async function checkPostgres() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 2_000 });
  try {
    await pool.query("select 1");
  } finally {
    await pool.end().catch(() => undefined);
  }
}

async function checkRedis() {
  if (!process.env.REDIS_URL) throw new Error("REDIS_URL is not configured");
  const redis = new IORedis(process.env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    enableOfflineQueue: false,
    connectTimeout: 2_000,
  });
  try {
    await redis.connect();
    const pong = await redis.ping();
    if (pong !== "PONG") throw new Error("Redis did not return PONG");
  } finally {
    redis.disconnect();
  }
}

async function checkS3() {
  const endpoint = process.env.S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error("S3 endpoint/bucket/credentials are not fully configured");
  }
  const client = new S3Client({
    endpoint,
    region: process.env.S3_REGION ?? "us-east-1",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
    credentials: { accessKeyId, secretAccessKey },
  });
  await client.send(new HeadBucketCommand({ Bucket: bucket }));
}

async function checkQdrant() {
  if (!process.env.QDRANT_URL) throw new Error("QDRANT_URL is not configured");
  const url = new URL("/collections", process.env.QDRANT_URL).toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: process.env.QDRANT_API_KEY ? { "api-key": process.env.QDRANT_API_KEY } : undefined,
    });
    if (!res.ok) throw new Error(`Qdrant returned HTTP ${res.status}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function checkNeo4j() {
  const uri = process.env.NEO4J_URI;
  if (!uri) throw new Error("NEO4J_URI is not configured");
  const driver = neo4j.driver(
    uri,
    neo4j.auth.basic(process.env.NEO4J_USER ?? "neo4j", process.env.NEO4J_PASSWORD ?? ""),
    { connectionAcquisitionTimeout: 2_000, maxConnectionPoolSize: 1 }
  );
  try {
    await driver.verifyConnectivity();
  } finally {
    await driver.close().catch(() => undefined);
  }
}

export async function checkDependencies(): Promise<ReadinessResult> {
  const env = envHealth("web");

  const checks: Array<Promise<DependencyCheckResult>> = [
    env.ok ? runCheck("postgres", true, checkPostgres) : Promise.resolve(skipped("postgres", true, "Environment is not valid")),
    env.ok ? runCheck("redis", true, checkRedis) : Promise.resolve(skipped("redis", true, "Environment is not valid")),
    env.ok ? runCheck("s3", true, checkS3) : Promise.resolve(skipped("s3", true, "Environment is not valid")),
  ];

  if (process.env.QDRANT_URL) checks.push(runCheck("qdrant", false, checkQdrant));
  else checks.push(Promise.resolve(skipped("qdrant", false, "QDRANT_URL is not configured")));

  if (process.env.NEO4J_URI) checks.push(runCheck("neo4j", false, checkNeo4j));
  else checks.push(Promise.resolve(skipped("neo4j", false, "NEO4J_URI is not configured")));

  const dependencies = await Promise.all(checks);
  const requiredFailed = dependencies.some((dep) => dep.required && dep.status !== "ok");
  const optionalDegraded = dependencies.some((dep) => !dep.required && dep.status === "degraded");
  const ok = env.ok && !requiredFailed;

  return {
    ok,
    status: ok ? (optionalDegraded ? "degraded" : "ready") : "not_ready",
    checkedAt: new Date().toISOString(),
    env,
    dependencies,
  };
}
