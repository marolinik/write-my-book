// Reproduce the exact failing DB call using the SAME generated Prisma client the
// running server uses (node_modules/@prisma/client). Answers: does db.freeTierUsage
// exist on the generated client, and does the findUnique that billing + ghost-text
// both run actually throw? Prints the FULL error (name/code/message) RAW.
// DATABASE_URL from process.env; never printed.
import { writeFileSync } from "node:fs";
import pkg from "@prisma/client";
const { PrismaClient } = pkg;

const OUT = process.argv[2] || "./repro-prisma-freetier.json";
const CLERK_ID = "user_qa_p5";
const day = new Date().toISOString().slice(0, 10); // utcDayKey() shape "2026-07-20"
const report = { capturedAt: new Date().toISOString(), day, steps: {} };

const prisma = new PrismaClient();
try {
  // A. Does the generated client even expose the freeTierUsage delegate?
  report.steps.freeTierUsageDelegateType = typeof prisma.freeTierUsage;
  report.steps.hasFindUnique = !!(prisma.freeTierUsage && typeof prisma.freeTierUsage.findUnique === "function");

  // B. Resolve Sam's userId
  const sam = await prisma.user.findUnique({ where: { clerkId: CLERK_ID }, select: { id: true } });
  report.steps.samUserId = sam?.id ?? null;

  // C. The exact findUnique billing + ghost-text run (composite userId_day key)
  if (sam?.id && report.steps.hasFindUnique) {
    try {
      const row = await prisma.freeTierUsage.findUnique({
        where: { userId_day: { userId: sam.id, day } },
      });
      report.steps.findUniqueResult = row ?? null;
      report.steps.findUniqueThrew = false;
    } catch (e) {
      report.steps.findUniqueThrew = true;
      report.steps.findUniqueError = {
        name: e?.name ?? null,
        code: e?.code ?? null,
        message: String(e?.message ?? e).slice(0, 1200),
      };
    }
  }

  // D. Also exercise the other two Promise.all members of getFreeTierSnapshot, in
  // case one of THEM is the real thrower (agentSession.count / book.aggregate).
  if (sam?.id) {
    try {
      const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
      report.steps.agentSessionCount = await prisma.agentSession.count({
        where: { userId: sam.id, startedAt: { gte: monthStart } },
      });
    } catch (e) {
      report.steps.agentSessionCountError = { name: e?.name, code: e?.code, message: String(e?.message ?? e).slice(0, 600) };
    }
    try {
      const agg = await prisma.book.aggregate({ where: { userId: sam.id }, _sum: { wordCount: true } });
      report.steps.bookWordSum = agg._sum.wordCount ?? 0;
    } catch (e) {
      report.steps.bookAggregateError = { name: e?.name, code: e?.code, message: String(e?.message ?? e).slice(0, 600) };
    }
  }
} catch (e) {
  report.fatal = { name: e?.name, code: e?.code, message: String(e?.message ?? e).slice(0, 1200) };
} finally {
  await prisma.$disconnect().catch(() => {});
}
writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
