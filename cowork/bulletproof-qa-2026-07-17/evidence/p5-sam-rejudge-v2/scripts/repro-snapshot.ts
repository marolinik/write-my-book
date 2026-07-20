// Faithful reproduction of the EXACT code path the billing + ghost-text routes run,
// using the app's own modules (fresh import from disk). If this SUCCEEDS while the
// live HTTP route 500s, the fix is correct in code+DB+generated-client but the
// running Next dev server is serving a STALE cached Prisma client (db.ts caches the
// instance on globalThis; a hot-reload of route files does not rebuild it) — i.e.
// the web server was never truly restarted. DATABASE_URL from process.env; not printed.
// Run:  npx tsx --env-file=.env <thisfile> <outfile>
import { writeFileSync } from "node:fs";
import { db } from "@/lib/db";
import { getFreeTierSnapshot } from "@/lib/billing/free-tier-meters";

const OUT = process.argv[2] || "./repro-snapshot.json";
const CLERK_ID = "user_qa_p5";
const day = new Date().toISOString().slice(0, 10);
const report: Record<string, unknown> = { capturedAt: new Date().toISOString(), day, steps: {} };
const steps = report.steps as Record<string, unknown>;

async function main() {
  const sam = await db.user.findUnique({ where: { clerkId: CLERK_ID }, select: { id: true } });
  steps.samUserId = sam?.id ?? null;
  steps.freeTierUsageDelegateType = typeof db.freeTierUsage;

  if (!sam?.id) return;

  // A. direct findUnique (billing + ghost-text share this)
  try {
    const row = await db.freeTierUsage.findUnique({ where: { userId_day: { userId: sam.id, day } } });
    steps.directFindUnique = { threw: false, row: row ?? null };
  } catch (e) {
    steps.directFindUnique = { threw: true, name: (e as Error).name, message: String((e as Error).message).slice(0, 1000) };
  }

  // B. full snapshot (the exact function the subscription route awaits)
  try {
    const snap = await getFreeTierSnapshot(sam.id);
    steps.getFreeTierSnapshot = { threw: false, snapshot: snap };
  } catch (e) {
    steps.getFreeTierSnapshot = { threw: true, name: (e as Error).name, message: String((e as Error).message).slice(0, 1000) };
  }
}

main()
  .catch((e) => { report.fatal = { name: (e as Error).name, message: String((e as Error).message).slice(0, 1000) }; })
  .finally(async () => {
    await db.$disconnect().catch(() => {});
    writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  });
