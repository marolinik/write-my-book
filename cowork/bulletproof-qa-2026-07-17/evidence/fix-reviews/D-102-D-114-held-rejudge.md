# D-102..D-114 — held-persona re-judge surfaced defects (2026-07-20)

Source: fresh P6/P8/P1/P7 captures (`b64644a`) + blind Fable panels
(`judging/held-rejudge-fable-raw.md`). IDs assigned by team-lead. Next free: **D-115**.

| ID | Sev | Persona | Summary | Evidence |
|---|---|---|---|---|
| D-102 | S4 | P6 | Overlapping para-6 findings on subsuming spans: applying one makes the other's originalText un-findable → 409 dead-end (no data loss) | p6-owen-rejudge/api-traces/p1c-inspect-findings.json |
| D-103 | S4 | P6 | WriterMemory accumulates near-duplicate constraints (per-finding unique key, no semantic dedup) → prompt-bloat/conflicting-guidance risk | p6-owen-rejudge/api-traces/p3b-memory-fix.json |
| D-104 | **S3** (judge-escalated from S4) | P1 | Discuss turns emitting only structured fields return `assistantMessage:""` → blank reply bubble (`finding-conversation.tsx:73` `??` misses empty string). 2 of 3 live turns hit it — visual ghost of D-04. Sub-note: `computeConversationView` overwrites `latestRevision` unconditionally | p1-maya-rejudge/transcripts/discuss-turn{2,3}.json |
| D-105 | **S3 (plausible, UNCONFIRMED — verify first)** | P6 | D-41b span-coherence trap: sentence-scoped discuss compromise persisted onto `newText` of a finding whose `originalText` spans 3 sentences (incl. a registered device + plot beat); post-discuss originalText never captured. If span not narrowed, apply would silently delete ~2 sentences never proposed for removal. **Verification = read discuss revision write-back path + capture the pending b48e321f row** | p6-owen-rejudge/api-traces/p2-discuss-apply.json |
| D-106 | S4 | P6 | Raw `<<<REMEMBER category="preference">>>…<<<END>>>` control markup persisted verbatim in `finding_replies.content` (API strips it; DB row retains). UI leak if history rendered from DB | p6-owen-rejudge/api-traces/p3b-memory-fix.json |
| D-107 | **S3** (all 3 P1 judges filed independently) | P1/P6 | Pending-duplicate findings accumulate across dev-edit reruns (4 identical show-tell findings on one passage); memory constraint doesn't retro-resolve pending siblings — suppression only arms on DISMISSED lineage. "Tell it once" leaks through pending duplicates | p1-maya-rejudge/api-traces/32_findings-after-devedit2.json |
| D-108 | S3 | P6 | Live STYLE FINGERPRINT doc (fed to the editor every run + writer-facing) still contains ≥6 glitch corruption tokens (D-40 artifact never regenerated) — served today, not just stored | p6-owen-rejudge (fingerprint doc) |
| D-109 | S3 | P6 | Discuss is a blocking non-streaming POST: 157.2s synchronous wall time with zero interim feedback (adapt turn 22.5s — high variance) | p6-owen-rejudge/transcripts/discuss-crit-holdground-b48e321f.json |
| D-110 | S4 | P8 | Gate-semantic inconsistency: batch paywall → 429 while sibling plan gates → 403; 429 wrongly signals rate/retry for a plan-feature gate | p8-rita-rejudge (E5 vs D2/D4/D5 probes) |
| D-111 | S4 | P7 | PDF XMP `dc:title` carries literal `---` where /Info has the em dash (typst smart-dash leak); XMP-preferring readers show wrong title. Also: analyzer mojibake decode artifact recorded unresolved | p7-bao-rejudge/pdf-analysis.json |
| D-112 | S4 | P8 | `GET /api/series/{id}/books` → 405 with zero-length body — only non-enveloped response in the sweep (D-15 class) | p8-rita-rejudge (K2) |
| D-113 | S3 | P1 | Dev Edit Report persists factual errors into a user-facing doc: "~570 words" (real 704, byte-verified) and "Edit Date: 2025" (real 2026) | p1-maya-rejudge (session 5574be0f report) |
| D-114 | S3 | P1 | Finding b92055ea flags "has changed" as tense clash inside a deliberate generic-present aphorism; suggested "had changed" breaks the frame — mild voice-flattening, not caught/withheld (D8 ≤8.0 cap trigger) | p1-maya-rejudge/api-traces/03_findings-state.json |

## Carried STILL-OPEN (pre-existing IDs, re-confirmed live this round)
- **D-43** (S2, P6 — new P6 binding-constraint candidate): editor-model override never
  governs line-edit; BYOK user sets opus, billed qwen, no disclosure. Silent misroute.
- **D-49** (S3, P6): rationale fabricates a fingerprint quotation ("clipped, procedural,
  emotionally controlled" absent from doc). Judges NARROWED scope: rationale only, report
  paraphrases; the "milder instance" was a markdown-bold false positive.
- **D-42** (S3, P6): no GET session-status endpoint — SSE-disconnected clients have no
  recovery path.
- **D-100** (S2, P5): reasoning-model ghost-text 502 — still the platform-MIN binder.
- **D-101** (P8 judges reinforce): all fence proof rides the dev E2E shim; production
  auth boundary + shim-gating negative control untested.

## Fix-priority reading (founder call pending)
S2/S3 cluster worth a next fix-wave: D-100 (MIN binder), D-43 (silent billing misroute),
D-105 (verify first — destructive-apply risk), D-107+D-103 (duplicate-noise family),
D-104 (blank bubble), D-113 (report lies), D-108 (corrupted fingerprint served),
D-109 (blocking discuss). S4s are polish batch.
