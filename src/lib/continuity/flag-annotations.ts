// src/lib/continuity/flag-annotations.ts
import type { AnnotationItem } from "@/components/editor/annotation-extension";
import type { ContinuityFlagInput } from "@/lib/continuity/continuity-flags";

type ScanFlag = ContinuityFlagInput & { id: string };

/** Map the current chapter's anchored live flags to inline annotations.
 *  Other-chapter and book-level flags are skipped (they surface in the indicator). */
export function continuityFlagsToAnnotations(flags: ScanFlag[], currentChapter: number): AnnotationItem[] {
  const out: AnnotationItem[] = [];
  for (const f of flags) {
    if (f.chapterNumber !== currentChapter || !f.anchor) continue;
    out.push({ id: `continuity-${f.id}`, type: "continuity", text: f.anchor, description: f.description, findingId: f.id });
  }
  return out;
}
