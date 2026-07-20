/**
 * Dismiss a finding and verify the D8 conversational-learning loop:
 *  - PATCH finding {action:dismiss, reason} -> status dismissed, rejectedAt NOT stamped (D-55)
 *  - GET /api/memory -> a new WriterMemory row appears whose content == the thread's
 *    last suggestedConstraint (the "tell it once, it's remembered" persistence)
 * Reads E2E_TEST_SECRET from process.env — never printed. Acts as user_qa_p1.
 *
 * Usage: npx tsx --env-file=.env <thisfile> <findingId> <reason> <traceDir>
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.QA_BASE ?? "http://localhost:3002";
const SECRET = process.env.E2E_TEST_SECRET;
const CLERK = "user_qa_p1";
const BOOK = "4116055c-6183-4675-926a-e04f31126951";
if (!SECRET) { console.error("FATAL: E2E_TEST_SECRET missing"); process.exit(1); }

const findingId = process.argv[2];
const reason = process.argv[3] ?? "Intentional voice pattern, per discuss thread.";
const traceDir = process.argv[4] ?? ".";
const H = { "x-e2e-test-secret": SECRET, "x-e2e-clerk-id": CLERK, "Content-Type": "application/json" };

async function req(method: string, path: string, body?: unknown) {
  const resp = await fetch(`${BASE}${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await resp.text();
  let parsed: any = null; try { parsed = JSON.parse(text); } catch {}
  return { status: resp.status, body: parsed ?? text };
}

async function main() {
  // Memory before
  const memBefore = await req("GET", `/api/memory?bookId=${BOOK}`);
  const beforeIds = Array.isArray(memBefore.body) ? memBefore.body.map((r: any) => r.id) : [];

  // Dismiss
  const dismiss = await req("PATCH", `/api/books/${BOOK}/editorial/findings/${findingId}`, { action: "dismiss", reason });
  writeFileSync(join(traceDir, `dismiss-${findingId}.json`), JSON.stringify(dismiss, null, 2));

  // Memory after
  const memAfter = await req("GET", `/api/memory?bookId=${BOOK}`);
  writeFileSync(join(traceDir, `memory-after-dismiss-${findingId}.json`), JSON.stringify(memAfter, null, 2));

  const afterRows = Array.isArray(memAfter.body) ? memAfter.body : [];
  const newRows = afterRows.filter((r: any) => !beforeIds.includes(r.id));

  console.log(`DISMISS ${findingId} -> ${dismiss.status}`);
  console.log(`  status=${dismiss.body?.status} dismissReason=${JSON.stringify(dismiss.body?.dismissReason)}`);
  console.log(`  rejectedAt(D-55, expect null)=${JSON.stringify(dismiss.body?.rejectedAt)}`);
  console.log(`MEMORY rows: before=${beforeIds.length} after=${afterRows.length} new=${newRows.length}`);
  for (const r of newRows) {
    console.log(`  NEW MEMORY id=${r.id} findingId=${r.findingId} category=${r.category} active=${r.active}`);
    console.log(`    content: ${r.content}`);
  }
  // Also dump full memory-after for the record
  writeFileSync(join(traceDir, `memory-after-dismiss-${findingId}-full.json`), JSON.stringify({ before: memBefore.body, after: memAfter.body, newRows }, null, 2));
}
main();
