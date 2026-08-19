# Corpora — committed, hashed, frozen BEFORE a run (W-F3 §3.1, §3.2)

Corpora are DATA — LLM assistance in *authoring* them is fine — but they are
committed, hashed, and frozen before a run (same pre-registration rule as scenario
specs). The continuity ground-truth CSV is **human/team-lead reviewed before first
use**: a wrong ground truth silently corrupts FP/recall both ways.

Each corpus dir carries a `corpus-manifest.csv` that pins `file → sha256` (and, for
continuity, `→ planted-defect-class → expected-flag`).

## What to assemble (per suite)

| Dir | Suite | Contents |
|---|---|---|
| `misquote/` | `misquote` | ≥5 real-prose chapters (assemble from The Salt Letters + the line-edit-quality-validation corpus). `.md`/`.txt`, one chapter per file. |
| `voice/` | `voice-flattening` | the line-edit-quality-validation corpus + 1 fresh corpus, including the registered signature devices. |
| `continuity/seeded/` | `continuity-precision` | ≥30 chapters with PLANTED contradictions (dead-character, location, timeline, relationship). |
| `continuity/clean/` | `continuity-precision` | ≥30 control chapters (no contradiction — must NOT flag). |
| `continuity/nonchron/` | `continuity-precision` | flashback / frame-story / in-media-res chapters — the false-positive trap; must NOT flag. |

## Ground-truth CSV format (continuity)

`continuity/corpus-manifest.csv`:

```
file,class,expectedFlag
seeded/ch-dead-character-01.md,dead-character,true
seeded/ch-location-conflict-02.md,location,true
clean/ch-control-01.md,none,false
nonchron/ch-flashback-01.md,none,false
```

`expectedFlag=true` ⇒ a continuity flag on this file counts toward RECALL.
`expectedFlag=false` ⇒ any flag on this file counts as a FALSE POSITIVE (must be 0).

Status: **corpus CONTENT is deferred** — it is a data-assembly task requiring the
real prose (Salt Letters chapters, line-edit corpus) plus human review of the
continuity ground truth. The harness code, scenario specs, and CSV contract are in
place; drop the files in, regenerate `corpus-manifest.csv` hashes, commit, then run.
