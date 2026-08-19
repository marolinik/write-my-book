// Phase 0: honesty-surface re-tests (no worker needed).
// D-35 wizard setupComplete no-op; D-39 silent unknown-key drop + ZodError leak;
// D-44 BYOK usage panel $0; D-43 model routing read; plus baseline state.
import { api, saveTrace, BOOK_ID } from "./_client";

async function main() {
  const out: Record<string, unknown> = {};

  // --- Baseline settings state ---
  out["00-settings-before"] = await api("GET", `/api/books/${BOOK_ID}/settings`);

  // --- D-35: wizard "Finish Setup" PATCH {setupComplete:true} ---
  out["10-D35-patch-setupComplete-true"] = await api(
    "PATCH",
    `/api/books/${BOOK_ID}/settings`,
    { setupComplete: true }
  );
  out["11-D35-get-after"] = await api("GET", `/api/books/${BOOK_ID}/settings`);

  // Also test setupImportSkipped (same silent-strip family)
  out["12-D35b-patch-setupImportSkipped"] = await api(
    "PATCH",
    `/api/books/${BOOK_ID}/settings`,
    { setupImportSkipped: true }
  );

  // --- D-39: unknown/typo key must 400 (strict), and NOT leak raw ZodError ---
  out["20-D39-unknown-key"] = await api(
    "PATCH",
    `/api/books/${BOOK_ID}/settings`,
    { bogusUnknownKey_qa: "x", styleStrictness: "balanced" }
  );

  // --- D-39 finding-route family: bad `status` body (baseline leaked full ZodError) ---
  // Send a wrong action enum to a nonexistent finding to trigger the schema path.
  out["21-D39-finding-bad-action"] = await api(
    "PATCH",
    `/api/books/${BOOK_ID}/editorial/findings/00000000-0000-0000-0000-000000000000`,
    { action: "not-a-real-action", dismissReason: "x" }
  );

  // --- D-44: BYOK per-key usage panel ---
  out["30-D44-api-keys"] = await api("GET", `/api/settings/api-keys`);

  // --- D-43 read: current default-model / role overrides ---
  out["40-D43-default-model"] = await api("GET", `/api/settings/default-model`);

  saveTrace("p0-honesty.json", out);
  // Console summary (no secrets)
  for (const [k, v] of Object.entries(out)) {
    const r = v as { status: number };
    console.log(k, "->", r.status);
  }
}
main().catch((e) => {
  console.error("ERR", e?.message ?? e);
  process.exit(1);
});
