/**
 * Clones a book — rows and storage — so a destructive pass can be rehearsed
 * on a copy instead of the writer's real manuscript.
 *
 * The copy is deliberately detached from its source's series (seriesId null):
 * a clone that joined the trilogy would change every series-level number the
 * owner reads.
 *
 * Documents store storageKey RELATIVE to the book's S3 prefix (userId/bookId),
 * so the rows can be copied verbatim only if the objects underneath them are
 * copied to the new prefix first. That is what makes this a clone rather than
 * a book full of unreadable documents.
 *
 * Run:    npx tsx scripts/dev-clone-book.ts --book <id|name> --name "New name"
 * Clean:  npx tsx scripts/dev-clone-book.ts --delete <clone id>
 *
 * --delete drops a clone's rows AND its storage prefix, so a rehearsal leaves
 * nothing behind. It refuses a book that still belongs to a series, which is
 * the cheapest available proof that it is a clone and not the real manuscript.
 */

import "dotenv/config";
import {
  S3Client,
  ListObjectsV2Command,
  CopyObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter: new PrismaPg(pool) });

/** Returns a copy of `row` without the identity columns a clone must not reuse. */
function withoutIdentity<T extends Record<string, unknown>>(
  row: T,
  ...keys: string[]
): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...row };
  for (const key of keys) delete copy[key];
  return copy;
}

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

function s3(): S3Client {
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("S3 credentials not configured — check .env");
  }
  return new S3Client({
    region: process.env.S3_REGION ?? "us-east-1",
    credentials: { accessKeyId, secretAccessKey },
    ...(process.env.S3_ENDPOINT && { endpoint: process.env.S3_ENDPOINT }),
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  });
}

/** Copies every object under one book prefix to another. Returns the count. */
async function copyPrefix(
  client: S3Client,
  bucket: string,
  fromPrefix: string,
  toPrefix: string
): Promise<number> {
  let token: string | undefined;
  let copied = 0;

  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: `${fromPrefix}/`,
        ContinuationToken: token,
      })
    );

    for (const obj of res.Contents ?? []) {
      if (!obj.Key) continue;
      const relative = obj.Key.slice(fromPrefix.length + 1);
      await client.send(
        new CopyObjectCommand({
          Bucket: bucket,
          CopySource: `${bucket}/${obj.Key}`,
          Key: `${toPrefix}/${relative}`,
        })
      );
      copied += 1;
    }

    token = res.NextContinuationToken;
  } while (token);

  return copied;
}

/** Deletes every object under one book prefix. Returns the count. */
async function deletePrefix(
  client: S3Client,
  bucket: string,
  prefix: string
): Promise<number> {
  let token: string | undefined;
  let deleted = 0;

  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: `${prefix}/`,
        ContinuationToken: token,
      })
    );

    for (const obj of res.Contents ?? []) {
      if (!obj.Key) continue;
      await client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: obj.Key })
      );
      deleted += 1;
    }

    token = res.NextContinuationToken;
  } while (token);

  return deleted;
}

async function remove(bookId: string) {
  const book = await db.book.findUnique({ where: { id: bookId } });
  if (!book) throw new Error(`No book with id ${bookId}`);
  if (book.seriesId) {
    throw new Error(
      `"${book.name}" still belongs to a series — refusing to delete it. ` +
        "This command is for clones, which are created detached."
    );
  }

  const bucket = process.env.S3_BUCKET ?? "wmb-projects";
  const prefix = book.s3Prefix ?? `${book.userId}/${book.id}`;
  const objects = await deletePrefix(s3(), bucket, prefix);

  // Rows go with the book: every relation in the clone is onDelete: Cascade.
  await db.book.delete({ where: { id: bookId } });
  console.log(`Deleted "${book.name}" and ${objects} storage objects`);
}

async function main() {
  const doomed = arg("--delete");
  if (doomed) {
    await remove(doomed);
    return;
  }

  const source = arg("--book");
  const newName = arg("--name");

  if (!source || !newName) {
    throw new Error(
      'Usage: npx tsx scripts/dev-clone-book.ts --book <id|name> --name "New name"\n' +
        "       npx tsx scripts/dev-clone-book.ts --delete <clone id>"
    );
  }

  const book = await db.book.findFirst({
    where: { OR: [{ id: source }, { name: source }] },
    include: { chapters: true, documents: true, settings: true },
  });

  if (!book) throw new Error(`No book matching "${source}"`);

  const clash = await db.book.findFirst({
    where: { userId: book.userId, name: newName },
  });
  if (clash) throw new Error(`"${newName}" already exists (${clash.id})`);

  console.log(`Source: ${book.name} (${book.id})`);
  console.log(
    `  ${book.chapters.length} chapters, ${book.documents.length} documents`
  );

  const copy = await db.book.create({
    data: {
      userId: book.userId,
      seriesId: null,
      bookNumber: 1,
      name: newName,
      genre: book.genre,
      language: book.language,
      status: book.status,
      description: book.description,
      authorNotes: book.authorNotes,
      wordCount: book.wordCount,
      targetWordCount: book.targetWordCount,
      chapterCount: book.chapterCount,
    },
  });

  // s3Prefix mirrors getBookStorage(userId, bookId).
  const prefix = `${copy.userId}/${copy.id}`;
  await db.book.update({ where: { id: copy.id }, data: { s3Prefix: prefix } });

  console.log(`Copy:   ${copy.name} (${copy.id})`);

  const bucket = process.env.S3_BUCKET ?? "wmb-projects";
  const objects = await copyPrefix(
    s3(),
    bucket,
    book.s3Prefix ?? `${book.userId}/${book.id}`,
    prefix
  );
  console.log(`  storage: ${objects} objects copied into ${prefix}`);

  if (book.settings) {
    const settings = withoutIdentity(book.settings, "id", "bookId");
    await db.bookSettings.create({
      data: { ...settings, bookId: copy.id } as never,
    });
  }

  for (const chapter of book.chapters) {
    const rest = withoutIdentity(chapter, "id", "bookId");
    await db.chapter.create({ data: { ...rest, bookId: copy.id } as never });
  }
  console.log(`  chapters: ${book.chapters.length}`);

  let versionCount = 0;
  for (const document of book.documents) {
    const rest = withoutIdentity(document, "id", "bookId");
    const created = await db.document.create({
      data: { ...rest, bookId: copy.id } as never,
    });
    const versions = await db.documentVersion.findMany({
      where: { documentId: document.id },
    });
    for (const version of versions) {
      const vrest = withoutIdentity(version, "id", "documentId");
      await db.documentVersion.create({
        data: { ...vrest, documentId: created.id } as never,
      });
      versionCount += 1;
    }
  }
  console.log(
    `  documents: ${book.documents.length} (${versionCount} versions)`
  );

  const findings = await db.editFinding.findMany({ where: { bookId: book.id } });
  for (const finding of findings) {
    const rest = withoutIdentity(finding, "id", "bookId");
    await db.editFinding.create({ data: { ...rest, bookId: copy.id } as never });
  }
  console.log(`  findings: ${findings.length}`);

  const flags = await db.continuityFlag.findMany({ where: { bookId: book.id } });
  for (const flag of flags) {
    const rest = withoutIdentity(flag, "id", "bookId");
    await db.continuityFlag.create({
      data: { ...rest, bookId: copy.id } as never,
    });
  }
  console.log(`  continuity flags: ${flags.length}`);

  console.log(`\nOpen at /books/${copy.id}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
    await pool.end();
  });
