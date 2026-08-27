# WriteMyBook — Evaluation Report
**Reviewer:** Nadia Kovac, indie author (literary fiction, second novel)
**Book tested:** *The Glass Tide* — full end-to-end session, 2026-08-26

## 1. Summary

This is the first AI writing tool whose output I would not be embarrassed to show my editor. The agents genuinely read my work, quoted it back at me line by line, caught a continuity error I planted on purpose, and wrote a 4,200-word chapter in my voice — counting tic, tide refrain, grey-sea grief and all. But the plumbing underneath is not finished: the ghostwritten chapter I watched get written never became a real "chapter," so my exports pretended it didn't exist, and the PDF button quietly hands you a markdown file. The promise "no API key needed to start" is true for about ninety seconds. I'd pay for this when the data integrity catches up to the prose quality.

## 2. The journey as I experienced it

Signup and onboarding were one click, no card, no key — genuinely welcoming. I created *The Glass Tide*, imported two chapters of my deliberately flawed manuscript (519 words), and got a clean chapter list back. Then I hit the wall: my first agent action (capture-style) hard-failed with `400 "No Anthropic API key configured."` So much for key-free. I added my Anthropic BYOK key — the flow itself was painless, validated instantly, masked nicely.

From there, the good part started. Capture-style ran ~3 minutes and produced a 3,800-word fingerprint that understood my book better than some workshop peers have: it named my "bimodal sentence rhythm," the mathematical metaphor system, even flagged grey = grief / blue = control. Story-bible and build-architecture followed; the architect paused and asked my *approval* before inventing backstory (Mara, the drowning, the car accident) — that gate is exactly right. When I tried write-chapter before plan-chapter, I got a precise `422 "Prerequisites not met"` telling me exactly which step satisfied it. That's how errors should read.

Then the mid-session wobble: the backend LLM died. Discuss returned a bare `500 {"error":"Failed to discuss finding"}`, wiki populate died with a raw `Connection refused` Python traceback in the response body. Once the stack was switched to the real Anthropic provider, discuss came back smart — it pushed back with a clarifying question instead of blindly rewriting — and wiki populated 46 entities. A continuity scan extracted entities into the graph cleanly… and flagged nothing, including the eye-color drift it should have caught.

Exports were the gut punch. Docx and epub came back 200 with `chapterCount: 2, wordCount: 572` — my 4,200-word Chapter 3, which the ghostwriter had just written and I'd read, was invisible. PDF returned 200 with a warning and a `.md` file inside.

## 3. Agent quality

This is the product's crown jewel, and I grade it harshly because it deserves to be taken seriously.

- **Style fingerprint:** precise and specific — it quoted my own lines ("She just knew," "the arithmetic only works if you keep all the terms on the left side") as calibration samples with reasons attached. Not generic flattery.
- **Ghostwriter:** the opening of Chapter 3 — "Imogen counted the rain streaks on the window the way she used to count the seconds between lightning and thunder. Twenty-three. Twenty-four." — is *my* counting motif, *my* rhythm, *my* grey. The *Tess of the d'Urbervilles* parallel (inherited guilt, silence making it worse) is a genuinely literary choice. No "delve," no "tapestry." I checked.
- **Dev-edit:** 18-point systematic pass, 5 findings, each with anchor quote, paragraph number, confidence score, and 2–3 ranked rewrite options. It caught my planted critical error — mother's eyes grey in ch.1 vs. brown in ch.2 — with confidence 1.0, *and* understood why it mattered ("undermines the symbolic system where grey represents grief"). It also caught my dove/diving repetition. Missed: my 12-vs-20-year math slip passed unflagged.
- **Discuss:** asked a clarifying question rather than executing a bad instruction. That's editorial judgment.
- **Approvals:** the architecture gate asked before inventing. Correct.

## 4. Usability & information architecture

I experienced this through the API layer, not pixels, so I judge the information design: it is mostly excellent. The 422 prerequisite chains teach the workflow ("Story Bible needed before designing architecture"). The honesty touches are rare and good — when the bible assistant wrote its answer into chat but never saved it, the product *told me so* and persisted it anyway. Streaming narration ("Delegating to Style Analyst…", tool names, running cost) made long runs legible. Cost display showed "$0.64 / $1.20" even while the free local model was active — provider-rate estimates, not my spend; fine, but label it. The raw 500s and the `Connection refused` traceback leaking to the client are the ugly exceptions.

## 5. Bugs & findings

| ID | Severity | What I experienced |
|---|---|---|
| SIM-01 | **HIGH** | Ghostwritten ch.3 exists only as a document, no Chapter row — chapter list stays at 2, exports ship `wordCount: 572` without my 4,200-word chapter. (I could see it happen: `WriteChapter` failed 4× with "Chapter 3 not found" before falling back to WriteDocument.) |
| SIM-02 | **HIGH** | PDF export silently degrades to markdown — pandoc `openTempFile: permission denied`, HTTP 200 with a warning. "Download PDF" delivers a .md. |
| SIM-03 | MEDIUM | Onboarding advertises no-key start; first agent action 400s demanding a key. The ramp ends at exactly the moment of value. |
| SIM-04 | LOW | Continuity net extracted entities (13+18) into Neo4j but flagged zero issues — the eye-color drift it should catch was only caught by dev-edit. |
| SIM-05 | Note | Single dismiss returns 200 but writes no WriterMemory and gives no feedback about what (wasn't) learned. By design, but invisible. |
| SIM-06 | Env | Host clock ~7s slow → Clerk rejected fresh tokens as iat-in-the-future. Host ops issue, not app code, but it would briefly break real logins. |

## 6. Feature coverage checklist

Onboarding ✓ works (SIM-03 caveat) · Keys/BYOK ✓ works · Books ✓ · Import ✓ · Style capture ✓ excellent · Story bible ✓ (with honest recovery) · Architecture ✓ (approval gate works) · Plan ✓ (planner ignored my letter-opening request, but the coach caught it and asked me) · Write ✓ content / ✗ persistence (SIM-01) · Dev-edit ✓ excellent · Discuss ✓ after provider fix / ✗ 500 before · Dismiss ✓ (SIM-05) · Memory ✓ stats healthy, 28 chunks · Wiki ✓ 46 entities after fix · Continuity ⚠ degraded (SIM-04) · Export ⚠ degraded (SIM-01, SIM-02) · Billing ✓ · Usage ✓ (63% cost-drift warning shown — honest) · Insights ✓ surfaced the eye-color warning · Analysis — untested (empty state, correct message) · Series ✓ empty state · Health ✓ all deps ok.

## 7. Grades

- **Usability: B** — superb error teaching and workflow gates; undercut by silent data loss in the flagship flow.
- **Design (IA/copy/feedback): B+** — honest, legible, well-worded; loses points for raw 500s and the key-free bait.
- **Agent quality: A−** — publishable-grade editorial intelligence; planner overrode one explicit instruction.
- **Feature completeness: B−** — the full pipeline exists; continuity is hollow, exports incomplete, PDF broken.
- **Reliability: C+** — two HIGH-severity silent-failure bugs in export/persistence plus a mid-session backend death.

**Overall: B−**

## 8. What would make me pay for this

1. **Fix chapter persistence end-to-end** — a written chapter must be a real chapter everywhere, exports included. Non-negotiable.
2. **A working continuity net** — I want the eye-color net, not just the eye-color editor; cross-chapter fact checking is why I'd subscribe.
3. **Honest, real-cost metering** — show me what I actually spent, per agent, per book, with the estimate clearly labeled.
