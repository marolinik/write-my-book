import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { assertEnvReady } from "@/lib/env";

const globalForPrisma = globalThis as unknown as {
  prisma: InstanceType<typeof PrismaClient> | undefined;
};

function createPrismaClient() {
  // P1-17: the worker sets WMB_RUNTIME_TARGET=worker (src/worker-env.ts)
  // before importing this; its env has no Clerk or Stripe keys.
  assertEnvReady(process.env.WMB_RUNTIME_TARGET === "worker" ? "worker" : "web");
  // P2-36: bounded pool, fail fast on connect, and a server-side statement
  // timeout, instead of library defaults (no connect timeout, no statement
  // timeout). Web and worker each open one pool.
  const envInt = (key: string, fallback: number) => {
    const n = Number.parseInt(process.env[key] ?? "", 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: envInt("DB_POOL_MAX", 10),
    connectionTimeoutMillis: envInt("DB_CONNECT_TIMEOUT_MS", 5_000),
    idleTimeoutMillis: envInt("DB_IDLE_TIMEOUT_MS", 30_000),
    options: `-c statement_timeout=${envInt("DB_STATEMENT_TIMEOUT_MS", 30_000)}`,
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
