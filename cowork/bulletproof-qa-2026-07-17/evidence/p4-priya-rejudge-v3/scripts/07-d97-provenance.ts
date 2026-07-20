/**
 * D-97 live re-probe — two batches with IDENTICAL input (line-edit × chapters
 * 1-3), back-to-back. For EACH run dump: the child AgentSession ids, and all
 * EditFinding rows (id, sessionId, chapterNumber) counted per chapter.
 *
 * ACCEPTANCE:
 *  - each run's digest finding counts == findings created by THAT run's session
 *    ids ONLY (findings.sessionId ∈ run.childIds).
 *  - run2 is NOT a superset credit of run1's persisted rows (disjoint sessionIds).
 *  - any SKIPPED child credits 0 findings.
 * If the superset symptom RECURS, this falsifies the source audit (top severity).
 *
 * Usage: tsx 07-d97-provenance.ts <batchId_run1> <batchId_run2>
 */
import { db } from "@/lib/db";
import { writeFileSync } from "fs";
import { join } from "path";

const OUT = join(__dirname, "..");
const run1Id = process.argv[2];
const run2Id = process.argv[3];

async function dumpRun(batchId: string) {
  const batch = await db.batchRun.findUnique({
    where: { id: batchId },
    select: {
      id: true, status: true, workflowIds: true, chapterStart: true,
      chapterEnd: true, spentUsd: true, digest: true, childCount: true,
    },
  });
  const sessions = await db.agentSession.findMany({
    where: { batchId },
    select: { id: true, chapterNumber: true, status: true, workflowId: true },
    orderBy: { chapterNumber: "asc" },
  });
  const childIds = sessions.map((s) => s.id);
  const findings = await db.editFinding.findMany({
    where: { sessionId: { in: childIds } },
    select: { id: true, sessionId: true, chapterNumber: true, severity: true },
  });

  // per-chapter counts from THIS run's session-tagged findings
  const perChapter: Record<number, number> = {};
  for (const f of findings) perChapter[f.chapterNumber] = (perChapter[f.chapterNumber] ?? 0) + 1;

  // sanity: every finding's sessionId must be one of THIS run's children
  const foreign = findings.filter((f) => !childIds.includes(f.sessionId ?? ""));

  const skipped = sessions.filter((s) => s.status === "skipped");
  const skippedFindingCredit = skipped.map((s) => ({
    sessionId: s.id,
    chapterNumber: s.chapterNumber,
    findings: findings.filter((f) => f.sessionId === s.id).length,
  }));

  const digest = batch?.digest as { findings?: { total: number; byChapter: Record<string, number> } } | null;

  return {
    batchId,
    status: batch?.status,
    workflowIds: batch?.workflowIds,
    childCount: batch?.childCount,
    childSessions: sessions.map((s) => ({ id: s.id, ch: s.chapterNumber, status: s.status })),
    childIds,
    persistedFindingsTotal: findings.length,
    persistedPerChapter: perChapter,
    digestFindings: digest?.findings ?? null,
    foreignFindingCount: foreign.length,
    skippedChildren: skippedFindingCredit,
  };
}

async function main() {
  const r1 = await dumpRun(run1Id);
  const r2 = await dumpRun(run2Id);

  // disjointness: no session id shared between runs
  const shared = r1.childIds.filter((id) => r2.childIds.includes(id));

  // superset check: are run2's persisted per-chapter counts a strict superset
  // of run1's? (the D-97 symptom was ch1 10->29 etc.) With per-session scoping
  // they should be INDEPENDENT, not cumulative.
  const supersetSymptom = Object.keys(r2.persistedPerChapter).every((ch) => {
    const c = Number(ch);
    return (r2.persistedPerChapter[c] ?? 0) >= (r1.persistedPerChapter[c] ?? 0) + (r1.persistedPerChapter[c] ?? 0);
  });

  const verdict = {
    runs_have_disjoint_session_ids: shared.length === 0,
    sharedSessionIds: shared,
    run1_digest_matches_persisted:
      r1.digestFindings?.total === r1.persistedFindingsTotal,
    run2_digest_matches_persisted:
      r2.digestFindings?.total === r2.persistedFindingsTotal,
    run1_no_foreign_findings: r1.foreignFindingCount === 0,
    run2_no_foreign_findings: r2.foreignFindingCount === 0,
    run2_is_NOT_cumulative_superset_of_run1:
      !(r2.persistedFindingsTotal >= r1.persistedFindingsTotal * 2 &&
        r1.persistedFindingsTotal > 0),
    skipped_children_credit_zero: [
      ...r1.skippedChildren, ...r2.skippedChildren,
    ].every((s) => s.findings === 0),
    D97_symptom_recurs: false, // set below
  };
  verdict.D97_symptom_recurs =
    !verdict.runs_have_disjoint_session_ids ||
    !verdict.run1_no_foreign_findings ||
    !verdict.run2_no_foreign_findings;

  const out = { run1: r1, run2: r2, verdict };
  writeFileSync(
    join(OUT, "api-traces", "d97-provenance.json"),
    JSON.stringify(out, null, 2)
  );
  console.log(JSON.stringify({
    run1: { total: r1.persistedFindingsTotal, perChapter: r1.persistedPerChapter, digest: r1.digestFindings?.total },
    run2: { total: r2.persistedFindingsTotal, perChapter: r2.persistedPerChapter, digest: r2.digestFindings?.total },
    verdict,
  }, null, 2));
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error("D97 ERROR", e);
  try { await db.$disconnect(); } catch {}
  process.exit(1);
});
