# P2 "Gerald" head-to-head — WriteMyBook vs the tools he already owns

**Date:** 2026-07-27 · **Build:** `qa/bulletproof-2026-07-17` @ `108fec3` · **Persona:** P2 Gerald,
career genre novelist, 30 books shipped, revising thriller #31 on deadline.

## Method and its declared limits (read this before the table)

`ENVIRONMENT-AND-LIMITS.md` pre-declares that this campaign has **no paid incumbent
accounts** (Scrivener, Sudowrite, NovelAI, Novelcrafter, ProWritingAid). Therefore:

* **WriteMyBook column = measured this wave**, every number traceable to a 44-series
  artifact in this directory.
* **Incumbent columns = qualitative**, from published capability, not from a timed
  session on a licensed install. They are **not** measurements and must not be read as
  such. Where an incumbent claim would decide a WIN/LOSE, the row is marked
  `NOT-ADJUDICATED` instead of guessed.

Gerald's four jobs, from `TEST-PLAN.md:21-31`: **(J1)** get a 40K manuscript in,
**(J2)** book-wide find/replace, **(J3)** two-device conflict safety, **(J4)** export
docx without losing a word.

---

## The table

| Job | WriteMyBook (measured, this wave) | Scrivener | MS Word | Sudowrite / Novelcrafter | Verdict |
|---|---|---|---|---|---|
| **J1 — import 42K words, 8 chapters, heavy unicode** | Wizard detects 8 chapters, shows per-chapter word counts, warns about the existing chapter, imports in **6.1 s**; **8/8 chapter bodies byte-exact, delta 0 chars**, every diacritic/em-dash/curly quote intact (`44i`, `44i2`, `44i3`) | Import + split is mature but manual; chapter split by separator is a configured step | Opens the file; no chapter model at all | Import exists; chapter detection varies | **WIN vs Word, TIE-to-WIN vs Scrivener** (Scrivener's is more configurable; WMB's is faster and structure-aware out of the box) |
| **J2 — rename a character book-wide** | Dialog is real, keyboard-reachable (Ctrl+Shift+F), scoped chapter/book, live preview with per-chapter counts, case-sensitive switch. **No whole-word option** → `Sam`→`Max` also produced `Maxe`, `Maxple`, `Maxples`, `Maxovar`: **17 replacements where 6 were wanted** (`44k1`-`44k3`) | Project Replace has **Whole Word** | Find/Replace has **Match whole word only** | Varies | **LOSE.** Both 30-year-old incumbents ship the one toggle that makes this operation safe. This is the single most concrete competitive gap found this wave. |
| **J3 — two devices, same chapter, no lost words** | Losing tab gets a **non-blocking** amber chip in 4.1 s, keeps typing, dialog never auto-opens; explicit review shows a green/red diff and three honest choices; "Load theirs" **backs the loser's words up first** as a recoverable version (v4, `conflict-backup`) — proven by opening that version in the UI and reading the discarded sentence back (`44a`, `44b`, `44c`, `44c2`) | Sync conflicts produce **conflicted copies** the writer must reconcile by hand | Co-authoring merges, but on a local .docx two devices = two files | Cloud-first, last-write-wins in practice | **WIN.** This is the strongest artifact P2 has. Nothing in the incumbent set both (a) refuses to interrupt typing and (b) guarantees the discarded side is recoverable *by promise printed in the dialog*. |
| **J4 — export docx, zero content loss** | **NOT-ADJUDICATED this wave.** The export surface was not captured (see the capture doc's uncaptured list); the 07-18 bundle has no docx round-trip either | Compile to docx/epub/print is Scrivener's crown jewel | Native | Export exists | **NOT-ADJUDICATED** — do not claim a verdict here |

---

## "Would Gerald switch, and would he pay?"

**Conditionally yes — for J3, and only J3.**

Gerald's stated exit condition is "will leave forever the first time the tool loses a
word". This wave produced, in pixels, the only artifact class that speaks to that fear:
a real two-writer race in which the losing writer's words are (a) never silently
overwritten on the server, (b) never yanked out of the editor mid-sentence, and (c)
recoverable *after* he chooses to discard them. Scrivener's answer to the same scenario
is a conflicted copy; Word's is a second file. That is a genuine moat and it is worth
paying for.

**What would stop him signing up today, in his own order of priority:**

1. **No whole-word find/replace (J2).** He renames characters for a living. A tool that
   turns `samovar` into `Maxovar` and tells him "17 replacements" as if that were good
   news is a tool he cannot run on a live manuscript. Cheapest fix on this list.
2. **Export fidelity unproven (J4).** He hands .docx to an editor. Until a round-trip is
   measured, this is an unknown, and unknowns on the delivery path are disqualifying.
3. **Deleted prose comes back (D-115).** A brand-new chapter that opens full of text he
   deleted — and silently keeps it on first save — is exactly the class of surprise that
   ends his trial (`44q1`-`44q3`).
4. **BYOK.** He has an OpenRouter key, so the wall is not his problem; but he notices
   that the model he selected is not the model that answered (`d51514c` reroute,
   undisclosed at point of use), and a pro who pays per token notices that quickly.

**What he would not pay for yet:** the AI itself. The first suggestion arrived in 2.6 s
and read like his book, which is a real improvement over the 07-20 502 — but the accepted
sentence slipped from third person into first person ("*I* poured another drink") inside a
close-third passage. One sample is not a verdict; it is the reason D8 needs more than one.
