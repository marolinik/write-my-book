# D-90 / D-91 — surfaced by the P3 rejudge blind panel (2026-07-20)

Both found independently by the fresh blind panel scoring `evidence/p3-selena-rejudge/`; the capture executor MISSED both. Neither is the binding floor on P3=6.5 (P3 floors on capture-gaps + dev-perf + no flag-resolution lifecycle, not D8 alone) — but both are real continuity-moat trust risks → follow-up fix track, not this re-judge.

## D-90 (MEDIUM, S2-class latent-FP) — extraction over-inference writes a hallucinated death into canon
- **Where:** entity-extraction / `updateFromChapter()` LLM path (graph write). Instance: `evidence/p3-selena-rejudge/neo4j-reads/02_book2_graph_state.txt` vs `api-traces/b2_put_content_ch2.json`.
- **What:** book2 ch2 prose states only that Zoë Rasmussen *"had left her charts to the archive"* — no death anywhere in book2. Extraction recorded `Zoë Rasmussen status=dead deathChapter=2` + an Event `"Death of Zoë Rasmussen" type=death`.
- **Why it bites:** no flag fires now, but the false canon is a `dead_character_reappears` time-bomb — the moment Selena writes Zoë into a later chapter she gets a continuity flag grounded in a death she never wrote, and series-context reports a living character as dead. This is the exact fabricated-output class the campaign's S2 tier exists for.
- **Root-cause hypothesis (unverified — do not trust, re-derive):** the extractor infers death/departure status from soft narrative cues ("left to the archive" / valedictory tone) without a hard textual death assertion; `status=dead` + `deathChapter` should require an explicit death signal, not a departure/retrospective one. Candidate guard: gate `status=dead`/death-Event creation on an explicit-death predicate, or mark model-inferred deaths with a confidence marker + do not let low-confidence death drive dead_character_reappears.
- **Fix owner:** graph/extraction lane. TDD RED-first (seed "left to the archive"-style prose, assert NO death node), Fable-verified, STOP-and-report if the guard suppresses genuine deaths.

## D-91 (LOW-MED, S3) — relationship_contradiction flag persists with no chapter attribution or jump affordance
- **Where:** relationship_contradiction flag construction / persistence. Instance: `evidence/p3-selena-rejudge/api-traces/57_http_scan_book1_ch5_v2.json`, `neo4j-reads/06_relcontra_live_persist.txt` ("ch0").
- **What:** the flag persists + serves over HTTP with `chapterNumber:0, jumpChapter:null, anchor:null` while dead_character_reappears and timeline_violation carry full `jumpChapter`+`anchor`. In any UI the flag anchors to "chapter 0" with dead navigation for that entire flag class.
- **Root-cause hypothesis (unverified):** the relationship_contradiction builder never resolves a representative chapter/anchor from the two conflicting edges (both edges carry a `.chapter`; the flag should attribute to the later/asserting chapter and anchor to its text). Candidate: populate chapterNumber/jumpChapter/anchor from the contradicting edge pair.
- **Fix owner:** graph/continuity lane. TDD RED-first (assert non-zero chapterNumber + non-null anchor on a relationship_contradiction), Fable-verified.

## Related, NOT re-filed (already tracked / disclosed)
- Event canonicalization word-order residual ("Death of Dorn Kappel" vs "Dorn Kappel's death") — class of **D-85**; instance in `02`. Hygiene track.
- **OBS-1** (silent flag disappearance after unrelated later-chapter edge re-assertion — last-write `.chapter` on a single edge) and **OBS-2** (Zoë/Zoe diacritic character fork) — both honestly disclosed by the executor in `p3-selena-rejudge/defects.md`; detection-completeness gaps, design-bounded, not hidden defects.
- Route-level tenancy proof gap: D-30 isolation proven at the GRAPH layer only; no P3-HTTP-read-vs-P4-book (expect 403/404) probe. Test-coverage gap, not a product defect — the graph write-isolation is proven. Add a route-authz probe to any P3 re-capture used for a certification claim.
