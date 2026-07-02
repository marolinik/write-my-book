// src/lib/continuity/flag-sync.ts
import type { ContinuityFlagInput } from "@/lib/continuity/continuity-flags";

export interface ExistingFlag {
  id: string;
  signature: string;
}

/**
 * Diff detected flags against existing ACTIVE flags by signature. New → create;
 * existing-but-gone → delete (resolve = delete the row, so a re-introduced
 * contradiction is created fresh — no tombstone). Book-wide symmetric: both
 * detected and existing span the whole book, so there is no cross-chapter
 * asymmetry. Idempotent: an unchanged re-scan yields empty create/delete.
 */
export function planFlagSync(input: {
  detected: ContinuityFlagInput[];
  existing: ExistingFlag[];
}): { toCreate: ContinuityFlagInput[]; toDelete: string[] } {
  const detectedSigs = new Set(input.detected.map((f) => f.signature));
  const existingSigs = new Set(input.existing.map((e) => e.signature));

  const seen = new Set<string>();
  const toCreate: ContinuityFlagInput[] = [];
  for (const f of input.detected) {
    if (existingSigs.has(f.signature)) continue;
    if (seen.has(f.signature)) continue;
    seen.add(f.signature);
    toCreate.push(f);
  }

  const toDelete = input.existing.filter((e) => !detectedSigs.has(e.signature)).map((e) => e.id);

  return { toCreate, toDelete };
}
