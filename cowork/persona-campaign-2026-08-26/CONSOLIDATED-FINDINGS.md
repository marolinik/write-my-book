# CONSOLIDATED FINDINGS — 6-Persona Campaign (2026-08-26)

Six personas (P1 Nadia + P2 Mac + P3 Priya + P4 Tomás + P5 Gracie + P6 Henrik),
~25 real agent sessions, full end-to-end journeys, real Clerk accounts, real
BYOK (Anthropic + OpenRouter), real Stripe upgrade (Priya Pro). Transcripts +
reports per persona in this directory; Nadia's in `../sim-user-nadia-2026-08-26/`.

## Grades (as judged)

| Persona | Overall | Highlight |
|---|---|---|
| P1 Nadia (pipeline) | **B−** | agents A-tier; data-integrity gaps |
| P2 Mac (validation/analysis) | **B−** | error plainness A−; scan flags still empty |
| P3 Priya (series) | **B+** | upgrade path proven; inherit wound |
| P4 Tomás (i18n) | **B+** | i18n honesty graded **A** |
| P5 Gracie (quick-assist) | **B+** | validation/fences excellent |
| P6 Henrik (editorial) | **B+** | editorial depth A− |
| **Campaign overall** | **B/B+** | fix the plumbing → A− territory |

---

## 🔴 HIGH — fix before launch (verified across personas)

| # | Finding | Evidence | Personas |
|---|---|---|---|
| H1 | **Ghostwritten chapters never create Chapter rows** — chapter list/count and EXPORTS miss them entirely | Export chapterCount:2 with a 4,200-word ch3 existing | P1, P2 |
| H2 | **PDF export silently degrades to .md** (pandoc `openTempFile: permission denied`, no TMPDIR in prod image; returns 200+warning) | 200 with `.md` file | P1, P2, P6 |
| H3 | **Series inherit returns success while applying nothing** `{"applied":[],"skipped":[...]}` on empty target book | inherit b1→b2 | P3 |
| H4 | **Revise inflates word count with revisionCount frozen at 0** (690→4008) — ledger wobble | post-revise state | P6 |
| H5 | **Automated continuity scan-flags never fire** — entity extraction works (13+18 entities), flags stay empty; contradictions caught only at agent level (series continuity, dev-edit) | 4 personas scanned | P1, P2, P6 |

## 🟡 MEDIUM — should-fix in the first post-launch sweep

| # | Finding | Personas |
|---|---|---|
| M1 | Key-free onboarding ends at first agent with 400 "No <provider> API key configured" — wizard should route to key setup first | P1, P2 |
| M2 | Ox Alpha registry ids 400 at default-model because the running image predates today's registry commit (deployment staleness note, not a code bug) | all |
| M3 | No rejection feedback on single dismissals (WriterMemory only learns after REPEATED dismissals — invisible) | P1 |
| M4 | `$` estimates shown during free/local-model runs are provider-rate fiction — label as estimates, show actual spend | P1, P6 |

## 🟢 LOW / notes

- L1: Dismiss/feedback endpoints need consistent body contracts (`action` vs `status`) — P1 driver error, P5 feedback shape
- L2: Series-context/inherit/query contract discovered empirically (405/400s were driver learning — API could be clearer)
- L3: Random 500 surfaces leak raw internal tracebacks (wiki populate showed Python traceback body) — P1

## ✅ Validated positives (do not regress)

- Complete billing upgrade loop: Free → gate → hosted checkout → Pro → gates open (P3)
- i18n honesty: language UI, fingerprint-es, findings-es, quick-assist-es, epub diacríticos (P4)
- Quick-assist in English + Spanish (P4, P5); fences 429, Zod 400s, error copy sells honestly
- Beta panel gates; editorial summary/history; marketing kit; discuss asks clarifying questions
- Scan+e2e positive list: series continuity caught name drift (P3); dev-edit caught planted critical error across genres (P1, P4); usage attribution key_source=user

---

## Recommended fix order (highest leverage first)

1. **H1** chapter-persistence: create/advance Chapter row inside write/plan/revise workflows (or explicit "insert draft" contract)
2. **H2** PDF: set TMPDIR=/tmp in Dockerfile/app env; add unit path proving PDF path (pandoc returns .pdf)
3. **H5** continuity detector: wire scan flags to actually fire on attribute/timeline drift (the agent-level check already proves the shape)
4. **H3** inherit: either copy setup docs or answer an explicit denial with reasons
5. **H4** revise: honor revisionCount and preserve intent vs. word inflation
6. **M1-M4** polish items in sweep

*Campaign notes: delegation for judge subagents failed at fan-out; reports were authored by the orchestrator with full evidence access (transcripts are in this directory for re-judging anytime). Ox Alpha registry entries were committed pre-campaign but absent from the 6-day-old running image — sessions ran real Anthropic BYOK (Sonnet/Haiku).*
