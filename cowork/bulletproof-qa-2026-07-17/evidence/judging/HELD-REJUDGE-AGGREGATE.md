# Held-persona re-judge — Fable panel aggregates (2026-07-20)

Method: fresh independent live captures (opus executors, committed `b64644a`) → blind
3-judge panels. **Two full panels ran on identical cached captures:** an opus panel
(Fable rate-limit fallback) and the **Fable panel (verdicts of record, per founder
model-policy "fable for verifying")**. Aggregation per GRADING-PROTOCOL: hard-floor dims
D1/D2/D7/D8 take MIN across judges; all other dims take median; NO-EVIDENCE excluded;
persona grade = lowest aggregated dim. Raw verdict tables: `held-rejudge-fable-raw.md`.

## P6 "Owen" (voice moat) — **6.0** (was 5.0, +1.0) — floor **D4**

| dim | D1 | D2 | D3 | D4 | D5 | D7 | D8 | D10 | D11 |
|---|---|---|---|---|---|---|---|---|---|
| agg | 7.0 | 7.0 | 6.5 | **6.0** | 6.5 | 6.5 | 7.5 | 8.0 | 7.5 |

- CLOSED live: D-35, D-39, D-44, D-55, D-41/41a/41b, D-50. D8 moat clean this run:
  0/3 misquotes byte-verified by judges, 6/6 devices survive, discuss holds+adapts,
  WriterMemory loop live.
- STILL-OPEN (D7 drag): **D-43** (editor-model override silently inert — BYOK stylist
  billed qwen while UI says opus), **D-49** (rationale quotes a fingerprint phrase absent
  from the fingerprint — judges narrowed blast radius: rationale only, NOT the report;
  the "milder instance" was a false positive on markdown bold markers), **D-42** (no
  session-status GET).
- Judge-surfaced NEW: D-105 span-coherence trap (S3 plausible — see register), D-106
  REMEMBER markup persisted in replies, D-108 fingerprint glitch tokens still served
  live, D-109 157s blocking discuss POST. D4=6.0 floor = wizard fixed but onboarding
  experience evidence thin (API-only bundle).

## P8 "Rita" (fences/money) — **6.5** (was 5.5, +1.0) — floor **D5**

| dim | D1 | D2 | D3 | D4 | D5 | D7 | D9 |
|---|---|---|---|---|---|---|---|
| agg | 7.5 | 7.5 | 7.5 | 7.0 | **6.5** | 8.0 | 7.0 |

- All 5 P8 code defects re-proven CLOSED live (D-01, D-56, D-15, D-14, D-06); 34/34
  fence probes hold, zero bypass/leak/raw-500; victim-intact positive controls verified.
- D7=8.0 with an explicit scope caveat all 3 judges named: every fence proven via the
  dev E2E shim — **production Clerk auth boundary untested**, no negative control that
  the shim secret is load-bearing, no proof the backdoor is disabled in prod (pairs
  with D-101).
- Judge nits: D-110 batch paywall 429 vs sibling 403 (gate-semantic inconsistency),
  D-112 K2 405 empty body (envelope break), "export never truncates" not positively
  tested in this bundle (covered by P7's).

## P1 "Maya" (discuss/memory) — **6.0** (was 5.5, +0.5) — floor **D3b**

| dim | D1 | D2 | D3 | D3b | D5 | D7 | D8 | D9 | D10 | D11 |
|---|---|---|---|---|---|---|---|---|---|---|
| agg | 7.5 | 8.0 | 6.5 | **6.0** | 6.5 | 7.5 | 7.5 | 7.5 | 7.0 | 7.0 |

- Floor driver CLOSED live: D-04 3-turn discuss + D-13 suppression gate LIVE-FIRED
  (dev-edit #1, old lineage) + dismiss→WriterMemory. D-01/D-44/D-55 closed. D-19 graph
  census verified (judges byte-checked all 10 anchors; sha256-stable chapter).
- Judge corrections to the executor narrative (kept honest): "non-empty every turn" is
  over-claimed — turns 2/3 had `assistantMessage:""` with substance only in structured
  fields (→ D-104, escalated S4→S3); the FRESH memory-loop "honored" proof is
  absence-of-re-attempt only (dev-edit #2 never re-tried the critique — weaker evidence
  class, only the OLD lineage gate-fire is live-triggered); ENV-01 citation/timeline
  sloppy (404 evidence is trace 12, not discuss-f1b-turn1).
- Judge-surfaced NEW: **D-107** pending-duplicate findings accumulate (4 identical
  show-tell findings on the same passage; memory constraint doesn't retro-resolve
  pending siblings — the "tell it once" promise leaks; all 3 judges filed it), D-113
  dev-edit report factual errors (~570 vs real 704 words, "Edit Date: 2025"), D-114
  b92055ea tense-clash suggestion (mild voice-flattening — D8 8.0-cap trigger; D8
  min 7.5 already under cap), Rita-seed junk findings pollute daily-plan count.

## P7 "Bao" (data-safety at scale) — **7.0** (was 5.0, +2.0) — floors **D3, D10**

| dim | D1 | D2 | D3 | D5 | D7 | D10 | D11 |
|---|---|---|---|---|---|---|---|
| agg | 8.5 | **9.0** | **7.0** | 7.5 | 7.5 | **7.0** | 7.5 |

- **D2 = 9.0 — the campaign's first hard-floor dim at 9+.** Judges independently
  re-derived from raw binaries: 80/80 sentinels in docx+epub+reordered-docx, unicode
  titles byte-equal, PDF 100 pages 2-way confirmed, reversal positional, zero 500s.
  Export-integrity cluster (D-05, D-46, D-47, D-61) CLOSED live.
- Honest bounds all 3 judges credited: PDF prose glyph-encoded → NOT-TESTABLE declared;
  D-46 residual (Ærø→'r' filename) + D-57 PARTIAL self-reported.
- Judge nits: D-111 PDF XMP dc:title "---" vs em-dash (+ executor's mojibake decode
  artifact), markdown export leg never exercised, no kill-mid-save probe, 51K words
  is "modest scale", wordCount drift +145 unexplained.

## P2 "Gerald" (data-integrity/two-tab) — **6.0** (was 5.0 stale-carry, +1.0) — floors **D4/D8/D10/D11**

| dim | D1 | D2 | D3 | D4 | D5 | D7 | D8 | D10 | D11 |
|---|---|---|---|---|---|---|---|---|---|
| agg | 6.5 | 6.5 | 6.5 | **6.0** | 6.5 | 6.5 | **6.0** | **6.0** | **6.0** |

Judged 2026-07-20 (fresh capture `p2-gerald-rejudge`, Fable 3-panel: FUNC 6.5 /
UX 6.0 / TRUST 5.5). Rule-7 debt cleared — no stale carries remain on the board.

- CLOSED live: **D-16** (unique constraint present + P2002-verified; 6-way race →
  exactly 1 row; CAS storm 1×200/9×409; read-your-writes 10/10) and **D-01**
  (malformed JSON → 400 envelope on 3 routes, no leak). Onboarding PARTIAL:
  382 ms time-to-first-word measured live, key-free on-ramp confirmed at API
  layer (caveat: pre-onboarded account, not fresh funnel).
- NEW: **D-115** (S3) deleted-chapter prose resurrection — CHAPTER_CONTENT keyed
  by book+type+chapterNumber survives chapter delete; new chapter reusing the
  number GETs deleted prose verbatim; first save blocked by phantom 409 leaking
  it. Live instance of deferred D-22.
- Judge corrections: "no silently-lost clean-200 write" overstated (stampless
  first-save window = last-write-wins at head, recoverable via version rows
  only); "NOT billed" on ghost-text 502 is script annotation, not ledger-read;
  D8 rests on n=1 inline-edit sample.
- D-100 hit P2's first AI touch too (ghost-text 502 on seeded default) —
  cross-persona confirmation of the platform-MIN binder.

## Full 8-persona board (post-re-judge)

| Persona | Baseline 07-19 | Now | Certification | Floor |
|---|---|---|---|---|
| P1 Maya | 5.5 | **6.0** | Fable 3-panel | D3b |
| P2 Gerald | 5.0 | **6.0** | Fable 3-panel (fresh capture 07-20) | D4/D8/D10/D11 |
| P3 Selena | 3.0 | **6.5** | Fable 3-panel (unanimous) | capture-gaps/D5 |
| P4 Priya | 4.0 | **~5.5** | v2 delta re-agg (panel-certifiable on request) | D3b/D8 |
| P5 Sam | 4.0 | **~4.5–5.0** | v2 delta re-agg | D11 via D-100 |
| P6 Owen | 5.0 | **6.0** | Fable 3-panel | D4 |
| P7 Bao | 5.0 | **7.0** | Fable 3-panel | D3/D10 |
| P8 Rita | 5.5 | **6.5** | Fable 3-panel | D5 |

**Platform MIN ≈ 4.5–5.0 (P5, bounded by D-100 — fix lane in flight per founder
ruling 2026-07-20)**; every other persona now ≥5.5 with fresh Fable-certified
verdicts. No stale carries remain (P2 re-judged 07-20). Baseline platform MIN 3.0
is gone; every re-judged persona moved up (+0.5 to +3.5).

**Cross-panel calibration:** the opus panel (same bundles) landed within ±0.5 of Fable
on every persona headline — no systematic judge-model bias detected; Fable slightly
stricter on floors (D4/D3b singles).

**Systemic pattern holds:** every fresh capture again relocated the floor to
live-moment honesty/observability gaps (blank bubbles, pending-duplicate noise,
inert model override, blocking 157s POST) — not to missing features.
