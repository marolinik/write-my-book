/**
 * Repoint users still carrying the OLD platform default onto the current one.
 *
 * Changing `User.defaultModel`'s Prisma default only affects rows created after
 * the change — every existing user keeps the value written at signup. This
 * script moves ONLY rows whose default is still the previous platform default
 * (a value nobody chose, it was just the seed).
 *
 * CAVEAT: a user who explicitly SELECTED that same model is indistinguishable
 * from one who never touched the setting — the column stores no provenance. On a
 * shared deployment that means real BYOK users can be moved onto the fleet, so
 * read the dry-run list first and skip it if anyone on it chose that model on
 * purpose.
 *
 *   npx tsx scripts/migrate-default-model.ts            # dry run
 *   npx tsx scripts/migrate-default-model.ts --apply    # write
 */

// Standalone script: nothing loads .env for us the way Next does.
import "dotenv/config";
import { db } from "../src/lib/db";
import { getDefaultModelId } from "../src/lib/llm/defaults";
import { getModelDef } from "../src/lib/llm/model-registry";

/** The seed value shipped before the local-fleet default. */
const PREVIOUS_PLATFORM_DEFAULT = "anthropic/sonnet";

async function main() {
  const apply = process.argv.includes("--apply");
  const target = getDefaultModelId();

  if (!getModelDef(target)) {
    console.error(`Refusing to migrate: "${target}" is not a registry model.`);
    process.exit(1);
  }
  if (target === PREVIOUS_PLATFORM_DEFAULT) {
    console.log("Target equals the previous default — nothing to do.");
    return;
  }

  const stale = await db.user.findMany({
    where: { defaultModel: PREVIOUS_PLATFORM_DEFAULT },
    select: { id: true, email: true },
  });

  console.log(
    `${stale.length} user(s) still on "${PREVIOUS_PLATFORM_DEFAULT}" -> "${target}"`,
  );
  for (const u of stale) console.log(`  ${u.email}`);

  if (!apply) {
    console.log("Dry run. Re-run with --apply to write.");
    return;
  }

  if (stale.length > 0) {
    console.warn(
      `WARNING: rows that explicitly chose "${PREVIOUS_PLATFORM_DEFAULT}" are ` +
        "indistinguishable from never-touched ones and will be moved too.",
    );
  }

  const result = await db.user.updateMany({
    where: { defaultModel: PREVIOUS_PLATFORM_DEFAULT },
    data: { defaultModel: target },
  });
  console.log(`Updated ${result.count} user(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
