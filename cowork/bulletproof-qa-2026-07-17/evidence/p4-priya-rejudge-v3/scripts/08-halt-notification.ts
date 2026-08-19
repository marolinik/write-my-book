/**
 * D-98 + NEW-2 — fetch the halt batch's morning notification (BookNotification)
 * and assert the human-readable strings are honest:
 *   - title says the batch HALTED (budget cap), not "complete"
 *   - the cap does NOT render as "$0.00" (sub-cent formatCapUsd)
 *   - priority high, haltReason surfaced in message
 * Also dumps the healthy run1 notification for contrast (title "complete").
 *
 * Usage: tsx 08-halt-notification.ts <bookId> <haltBatchId>
 */
import { db } from "@/lib/db";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const OUT = join(__dirname, "..");
const bookId = process.argv[2];
const haltBatchId = process.argv[3];

async function main() {
  const fixture = JSON.parse(readFileSync(join(OUT, "fixture.json"), "utf8"));
  const bId = bookId || fixture.bookId;

  // all pipeline_complete notifications for this book, newest first
  const notes = await db.bookNotification.findMany({
    where: { bookId: bId, type: "pipeline_complete" },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true, title: true, message: true, priority: true,
      actionUrl: true, actionLabel: true, createdAt: true, read: true,
    },
  });

  // the halt batch row for cross-check
  const haltBatch = await db.batchRun.findUnique({
    where: { id: haltBatchId },
    select: { id: true, status: true, halted: true, haltReason: true, budgetCapUsd: true, spentUsd: true },
  });

  const haltNote = notes[0]; // most recent = the halt drill's
  const titleSaysHalted = /halt/i.test(haltNote?.title ?? "");
  const titleSaysComplete = /complete/i.test(haltNote?.title ?? "");
  const capRendersZero = /\$0\.00 cap/.test(haltNote?.message ?? "");
  const messageNamesHalt = /halt/i.test(haltNote?.message ?? "");

  const verdict = {
    haltBatch,
    haltNotification: haltNote,
    D98_title_says_halted: titleSaysHalted,
    D98_title_not_complete: !titleSaysComplete,
    D98_message_names_halt: messageNamesHalt,
    NEW2_cap_not_rendered_as_0_00: !capRendersZero,
    priority_high: haltNote?.priority === "high",
  };

  writeFileSync(
    join(OUT, "api-traces", "d98-new2-halt-notification.json"),
    JSON.stringify({ verdict, allNotifications: notes }, null, 2)
  );
  console.log(JSON.stringify(verdict, null, 2));
  console.log("\n--- ALL pipeline_complete notifications (newest first) ---");
  for (const n of notes) {
    console.log(`[${n.priority}] "${n.title}"  ::  ${n.message}`);
  }
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error("NOTE ERROR", e);
  try { await db.$disconnect(); } catch {}
  process.exit(1);
});
