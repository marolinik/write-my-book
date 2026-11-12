// Review I-3 (Wave 4): the rebuild route answers success:false with
// failedDocuments when some documents could not be embedded (P2-42), but the
// hook ignored the body and toasted "rebuilt successfully".
import { describe, it, expect } from "vitest";
import { getUIStrings } from "@/lib/i18n/ui-strings";
import { rebuildOutcome } from "@/lib/memory/rebuild-outcome";

const sr = getUIStrings("sr");
const en = getUIStrings("en");

describe("rebuildOutcome", () => {
  it("a full rebuild is a success", () => {
    expect(rebuildOutcome({ success: true, chunksIndexed: 12, failedDocuments: 0 }, en)).toEqual({
      ok: true,
      text: en.toasts.memoryIndexRebuilt,
    });
  });

  it("a partial rebuild is reported as a failure with the count, in the writer's language", () => {
    const out = rebuildOutcome({ success: false, chunksIndexed: 3, failedDocuments: 2 }, sr);
    expect(out.ok).toBe(false);
    expect(out.text).toBe(sr.toasts.memoryIndexRebuildPartial.replace("{count}", "2"));
    expect(out.text).toContain("2");
  });

  it("a body without the flag is not called a success", () => {
    expect(rebuildOutcome({}, en).ok).toBe(false);
  });
});
