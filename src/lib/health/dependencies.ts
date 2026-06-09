import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import IORedis from "ioredis";
import { db } from "@/lib/db";
import { verifyNeo4jConnection } from "@/lib/graph";
import { verifyQdrantConnection } from "@/lib/vector";

export type DependencyStatus = "ok" | "degraded" | "skipped";

export interface DependencyCheckResult {
  name: string;
  status: DependencyStatus;
  required: boolean;
  latencyMs: number;
  message?: string;
}

export interface DependencyHealthResult {
  ok: boolean;
  checkedAt: string;
  latencyMs: number;
  dependencies: DependencyCheckResult[];
}

const DEFAULT_TIMEOUT_MS = 2_500;

function isConfigured(...keys: string[]) {
  return keys.every((key) => Boolean(process.env[key]?.trim()));
}

function sanitizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message.replace(/postgresql:\/\/[^@\s]+@/gi, "postgresql://[REDACTED]@").replace(/redis:\/\/[^@\s]+@/gi, "redis://[REDACTED]@");
  }
  return "Unknown error";
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function check(
  name: string,
  required: boolean,
  fn: () => Promise<void>,
  configured = true
): Promise<DependencyCheckResult> {
  const start = Date.now();
  if (!configured) {
    return {
      name,
      required,
      status: required ? "degraded" : "skipped",
      latencyMs: 0,
      message: required ? "Required dependency is not configured" : "Optional dependency is not configured",
    };
  }

  try {
    await withTimeout(fn());
    return { name, required, status: "ok", latencyMs: Date.now() - start };
  } catch (error) {
    return {
      name,
      required,
      status: "degraded",
      latencyMs: Date.now() - start,
      message: sanitizeError(error),
    };
  }
}

async function checkPostgres() {
  await db.$queryRaw`SELECT 1`;
}

async function checkRedis() {
  const redis = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
    lazyConnect: true,
  });
  try {
    await redis.connect();
    await redis.ping();
  } finally {
    redis.disconnect();
  }
}

async function checkS3() {
  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const bucket = process.env.S3_BUCKET;
  const region = process.env.S3_REGION ?? "us-east-1";
  const forcePathStyle = process.env.S3_FORCE_PATH_STYLE === "true";

  if (!accessKeyId || !secretAccessKey || !bucket) {
    throw new Error("S3 credentials or bucket are not configured");
  }

  const client = new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
    ...(endpoint ? { endpoint } : {}),
    forcePathStyle,
  });
  await client.send(new HeadBucketCommand({ Bucket: bucket }));
}

export async function checkDependencies(): Promise<DependencyHealthResult> {
  const start = Date.now();
  const dependencies = await Promise.all([
    check("postgres", true, checkPostgres, isConfigured("DATABASE_URL")),
    check("redis", true, checkRedis, isConfigured("REDIS_URL")),
    check("s3", true, checkS3, isConfigured("S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_BUCKET")),
    check("qdrant", false, async () => {
      if (!(await verifyQdrantConnection())) throw new Error("Qdrant connection failed");
    }, isConfigured("QDRANT_URL")),
    check("neo4j", false, async () => {
      if (!(await verifyNeo4jConnection())) throw new Error("Neo4j connection failed");
    }, isConfigured("NEO4J_URI")),
  ]);

  return {
    ok: dependencies.every((dep) => !dep.required || dep.status === "ok"),
    checkedAt: new Date().toISOString(),
    latencyMs: Date.now() - start,
    dependencies,
  };
}
