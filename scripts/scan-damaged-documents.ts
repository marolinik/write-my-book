/**
 * O3 — list every document that still carries damage from before the encoding
 * and language fixes, across all books and series.
 *
 *   npx tsx scripts/scan-damaged-documents.ts [--user <userId>]
 *
 * U+FFFD is unrecoverable: the proxy decoded the upstream stream byte by byte,
 * so the original bytes are gone. Those documents can only be regenerated, and
 * the script names the workflow that rebuilds each one. Nothing is written or
 * deleted here — this only reports.
 */

import "dotenv/config";
import { db } from "../src/lib/db";
import { DocumentService } from "../src/lib/documents/document-service";
import {
  scanDocumentContent,
  regenerationWorkflowFor,
} from "../src/lib/documents/damage-scan";

async function main() {
  const userArg = process.argv.indexOf("--user");
  const userId = userArg > -1 ? process.argv[userArg + 1] : undefined;

  const documents = await db.document.findMany({
    where: {
      chapterNumber: null,
      ...(userId
        ? { OR: [{ book: { userId } }, { series: { userId } }] }
        : {}),
    },
    include: {
      book: { select: { id: true, name: true, userId: true, language: true } },
      series: { select: { id: true, title: true, userId: true } },
    },
    orderBy: { updatedAt: "asc" },
  });

  let damagedCount = 0;

  for (const doc of documents) {
    const ownerId = doc.book?.userId ?? doc.series?.userId;
    if (!ownerId) continue;

    const workflow = regenerationWorkflowFor(doc.type);
    if (!workflow) continue;

    const service = new DocumentService(
      ownerId,
      doc.bookId ?? undefined,
      doc.seriesId ?? undefined
    );
    const read = await service.read(doc.id).catch(() => null);
    if (!read) continue;

    // A series document has no language of its own; judge it by its first book.
    const expected = doc.book?.language ?? "en";
    const report = scanDocumentContent(read.content, expected);
    if (!report.damaged) continue;

    damagedCount++;
    const owner = doc.book?.name ?? doc.series?.title ?? "(unknown)";
    console.log(
      `${report.recoverable ? "DAMAGED " : "UNRECOVERABLE"}  ${owner} / ${doc.type}` +
        `  [${report.reasons.join(", ")}]` +
        `  regenerate with: ${workflow}` +
        `  (${doc.id})`
    );
  }

  console.log(
    `\n${damagedCount} damaged of ${documents.length} book/series-level documents scanned.`
  );
  if (damagedCount > 0) {
    console.log(
      "Documents marked UNRECOVERABLE contain U+FFFD: the original bytes are gone, " +
        "so they must be regenerated rather than edited."
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
