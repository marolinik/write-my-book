# D-157 (S2) — REMEMBER control-block leak + silent constraint drop — FIX LANE

Date: 2026-07-27 · Branch: `qa/bulletproof-2026-07-17` · Lane: code fix (no capture, no LLM calls)
Register entry: `fix-reviews/D-157-D-159-p1-capture-observations.md` · Capture: `p1-maya-rejudge/UI-CAPTURE-2026-07-26.md` (42a / 42b)
Judge prescription: P1 v2 blind 3-judge panel (`f34d5b7`) — unanimous, identical fix shape from all three.

---

## 1. Mechanism (confirmed at source)

`parseDiscussResponse` (`src/lib/editorial/discuss-prompt.ts`) matched control delimiters with
**exact-bracket** regexes:

```
/^<<<REVISION>>>$/
/^<<<REMEMBER(\s+category="[^"]*")?>>>$/
/^<<<END>>>$/
```

The model *writes* those delimiters, and it drifts. Live capture caught
`<<<REMEMBER category="preference">>` — **two** closing brackets — on **2 of 3** turns on finding
`036a088d`. With two brackets the start-delimiter regex fails, so the block is never recognised and
never marked consumed. Three consequences, all writer-visible or writer-invisible in the wrong direction:

- **(a) leak** — the raw span `<<<REMEMBER …>> … <<<END>>>` falls through into `assistantMessage`
  and renders verbatim in the discuss bubble (internal agent syntax shown to a novelist).
- **(b) no chip** — `computeConversationView().latestConstraint` stays undefined, so the
  "On 'Keep as-is', I'll remember: …" chip never appears.
- **(c) silent drop** — `PATCH /findings/[findingId]` re-parses the stored assistant turn on dismiss
  and only calls `upsertConversationConstraint` when `suggestedConstraint` is truthy. No constraint →
  **nothing is written to WriterMemory**, while the reply prose literally says "I'll remember".

(c) is the S2 core: the reply makes a promise the system does not keep, with no error anywhere.
Because persistence re-parses the *stored raw text* at dismiss time, fixing the parser fixes
persistence too — no route change and no data migration needed. Threads already stored with a
drifted block will now parse correctly on their next dismiss (retroactive recovery, free).

## 2. Shape chosen

Two layers, exactly as prescribed.

**Layer 1 — tolerant delimiters (primary path).** Shared bracket constants build all three strict
regexes, accepting **2–4 brackets** on each side:

```ts
const OPEN_BRACKETS = "<{2,4}";
const CLOSE_BRACKETS = ">{2,4}";
const REVISION_OPEN_RE = new RegExp(`^${OPEN_BRACKETS}REVISION${CLOSE_BRACKETS}$`);
const REMEMBER_OPEN_RE = new RegExp(`^${OPEN_BRACKETS}REMEMBER(\\s+category="[^"]*")?${CLOSE_BRACKETS}$`);
const BLOCK_END_RE     = new RegExp(`^${OPEN_BRACKETS}END${CLOSE_BRACKETS}$`);
```

REVISION shared the identical brittleness, so it got the identical tolerance (sibling-consistency
item in the prescription). Still line-anchored on the *trimmed whole line*, so an inline
`<<<REVISION>>>` mid-sentence remains prose — that pre-existing guarantee is untouched.

**Layer 2 — post-parse sweep (`sweepUnparsedControlBlocks`).** After the strict passes, any line
that is *only* a machine-looking delimiter (`/^<{2,4}\s*([A-Z][A-Z0-9_]*)\b(?:[^<>]*)>{1,4}$/`) and
has a matching terminator line (`/^<{1,4}\s*END\s*>{1,4}$/`) is treated as a control block:

- its span is removed from the display prose — **no control syntax can reach the writer**, whatever
  shape the drift takes (one closing bracket, unquoted `category=style`, unknown verb);
- if the verb is `REMEMBER` and the body is non-empty, the constraint is **still recovered** and
  flows into `suggestedConstraint` via the normal path → normal WriterMemory persistence;
- everything else stripped is `console.warn`-logged with verb + body-line count + whether a
  duplicate REMEMBER was discarded, and reported to callers as `strippedControlBlocks: string[]`
  (**verbs only**, never raw syntax). Nothing vanishes without a trace.

**Incomplete spans are deliberately left alone.** No terminator → not a block → prose stays intact.
That preserves the D-104 sibling behaviour ("malformed/unclosed → safe fallback, text preserved")
and keeps a writer's own stray angle brackets readable.

**Layer 2b — bubble last resort (`finding-conversation.ts`).** `assistantBubbleText` ended with
`return content` (raw) when nothing parsed. With stripping in place that would re-leak the exact
syntax layer 2 just removed, so a new honest fallback sits ahead of it:

```ts
if (parsed.strippedControlBlocks?.length) return STRIPPED_BLOCK_FALLBACK_TEXT;
// "The editor's reply couldn't be read, so nothing was saved from it."
```

Accurate by construction: that branch is only reachable when no prose, no revision and no
constraint survived — i.e. nothing *was* saved.

**Refactors folded in (behaviour-preserving):** category coercion and constraint extraction moved
into `coerceMemoryCategory` / `readConstraint` so the strict path and the sweep cannot diverge; the
attribute regex widened to `category="?([^"\s>]*)"?` so unquoted attributes parse. `blockLineIndex`
signature tightened to `readonly string[]`. The sweep copies the consumed set rather than mutating
the caller's.

## 3. Behaviour preserved (explicit non-regressions)

| Existing guarantee | Status |
|---|---|
| Well-formed `>>>` block → clean chip, clean prose (42a contrast shot path) | unchanged; new test asserts **zero** sweep activity and **zero** warnings on a well-formed reply |
| D-104 `assistantBubbleText` fallbacks (`2d715ee`) for structured-only revision / constraint turns | unchanged, both original tests green; new stripped-block fallback sits *after* them |
| D-41b revision write-back + D-105 span-narrowing in the discuss route | untouched (route not modified) |
| D-107 dedup (`cfe622a`) | untouched (different module) |
| Inline `<<<REVISION>>>` in prose stays prose | unchanged (line-anchored) |
| Unclosed block → fields undefined, text preserved | unchanged (sweep requires a terminator) |
| Invalid category coerces to `constraint` + warns | unchanged (same logic, extracted) |

## 4. Tests (TDD — RED first, 13 failures reproduced, then GREEN)

RED run before any source edit: **13 failed / 19 passed** across the two files. The two tests that
passed at RED are the deliberate regression guards (`D-157.10`, `D-157.11`).

`tests/unit/discuss-prompt.test.ts` — new describe `parseDiscussResponse — D-157 control-delimiter drift` (12):

1. `D-157.1` two-bracket REMEMBER open → constraint parsed, prose clean, no machine syntax
2. `D-157.2` two-bracket `<<<END>>` terminator still closes the block
3. `D-157.3` two-bracket open **and** two-bracket END together
4. `D-157.4` drifted REVISION delimiters parse (suggestion + why)
5. `D-157.5` well-formed REVISION + drifted REMEMBER in one reply — both survive
6. `D-157.6` sweep recovers a single-closing-bracket REMEMBER
7. `D-157.7` sweep recovers an unquoted `category=style` attribute
8. `D-157.8` unrecognized verb (`<<<NOTE>>>`) stripped from prose, `console.warn` spy asserts the log, verb reported
9. `D-157.9` empty REMEMBER body → stripped + logged, **no** constraint invented
10. `D-157.10` **guard**: well-formed reply untouched — no `strippedControlBlocks`, no warnings
11. `D-157.11` **guard**: unclosed drifted block left in prose, not swallowed
12. `D-157.12` the literal 42a-captured leak string now parses clean (constraint recovered, `"REMEMBER"` absent from prose)

`tests/unit/finding-conversation.test.ts` (3):

13. `computeConversationView` surfaces `latestConstraint` for a drifted turn (the missing chip, (b))
14. `assistantBubbleText` on a drifted REMEMBER-only turn → `CONSTRAINT_FALLBACK_TEXT`, never `"REMEMBER"`
15. `assistantBubbleText` on a stripped unknown-verb-only turn → `STRIPPED_BLOCK_FALLBACK_TEXT`, no `<<<`

**Suite: 174 files / 1434 tests, all green** (baseline before this lane: 174 / **1419** — +15, zero
pre-existing tests touched or weakened). `npx tsc --noEmit` clean. `eslint` clean on all four files.

## 5. Files changed

| File | Change |
|---|---|
| `src/lib/editorial/discuss-prompt.ts` | tolerant delimiter constants, `coerceMemoryCategory` / `readConstraint` extraction, `sweepUnparsedControlBlocks` + `findUnconsumedEnd`, `strippedControlBlocks` on `ParsedDiscussTurn` |
| `src/lib/editorial/finding-conversation.ts` | `STRIPPED_BLOCK_FALLBACK_TEXT` + guard ahead of the raw last resort in `assistantBubbleText` |
| `tests/unit/discuss-prompt.test.ts` | +12 tests |
| `tests/unit/finding-conversation.test.ts` | +3 tests |

Not touched: the discuss route, the findings PATCH route, the prompt text, any schema, any evidence
file other than this one.

## 6. In-lane findings and residual risk (disclosed)

- **Not fixed here — the prompt still shows only one delimiter form.** The root cause is a model
  that drifts against a format instruction. This lane hardens the *parser*, which is the durable
  half; it does not add a "delimiters must be exactly three brackets" restatement or a repair-retry
  to `buildDiscussPrompt`. Deliberate: parser tolerance covers all observed drift and costs no
  tokens, whereas prompt hardening is unverifiable without live LLM calls (out of lane scope).
- **Pre-existing greediness, unchanged.** `blockLineIndex` takes the *first* matching open delimiter
  and the *first* END after it. A malformed interleave (e.g. a REVISION whose own END drifted to one
  bracket, followed by a REMEMBER) can let the REVISION body swallow the intervening lines. Present
  before this lane, out of scope, no live sighting. A proper tokenizer would remove the class.
- **Only the first REMEMBER wins.** A reply with two complete REMEMBER blocks persists the first and
  strips the second with a `duplicate-remember` warning. Matches prior behaviour (was: first strict
  match wins) and is now logged rather than silent.
- **New response field.** `strippedControlBlocks` now appears in the discuss `POST` body and the
  `GET` thread view (both spread `...parseDiscussResponse(...)`). Verbs only — no raw syntax — and no
  client reads it except `assistantBubbleText`. Harmless, but it is a public payload change.
- **Sweep false-positive envelope.** A block is only stripped when a whole line is
  `<<UPPERCASE_VERB …>>` **and** a later line is a lone `<<END>>`. An editorial reply quoting
  manuscript text in that exact two-line shape would be stripped. Judged negligible: the verb must
  be all-caps, and the terminator must literally be `END`.
- **No live re-capture in this lane** (no dev server, no LLM calls per lane rules). Closure is
  source + unit evidence, including the literal captured leak string as a test fixture. A live
  re-shoot of a drifted turn is not reproducible on demand anyway — the drift is intermittent
  (2 of 3 turns), which is precisely why the parser had to become the guarantee.

## 7. Verdict

D-157 (a) leak, (b) missing chip and (c) silent WriterMemory drop are all closed at the parser, with
a second net that makes *any* future delimiter drift a logged strip instead of a writer-visible leak
or a broken promise. Suite 1434/1434, tsc clean, lint clean, zero behaviour change on well-formed
replies.
