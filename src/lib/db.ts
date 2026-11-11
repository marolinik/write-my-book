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
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
