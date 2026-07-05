# Write My Book — 5-Persona Product Evaluation

_Honest, grounded synthesis of five independent writer evaluations. Each persona graded the product for their own real workflow, from the code and behavior — not the brochure. Date: 2026-07-05._

---

## 1. Headline verdict

**Write My Book is, today, a genuinely excellent drafting-and-editing companion for the serious, self-directed author who already owns an API key — and a wall of friction for everyone who doesn't.** For the writer who wants to _just start typing_ and then be _taught_ instead of scolded, this is the most emotionally and technically intelligent tool in its class: write-first onboarding, production-grade autosave, a line editor explicitly architected to preserve voice rather than flatten it, honest metrics that refuse vanity numbers, cross-book series continuity nobody else ships, and dirt-cheap BYOK drafting economics. Four of five personas landed in B/B+ territory and all four said "yes, I'd use it." But the product is not yet a _product_ in the shrink-wrapped sense: it is pre-launch (prod DB push, backup-restore drill, and live Stripe/Clerk all unverified), it demands you bring — and understand — your own LLM key, its flagship editorial _quality_ has never been proven on a real literary page, and focus/immersive mode still leaves a ~30-second data-loss trapdoor in the exact mode writers reach for to disappear. **Who it's for today:** committed novelists (debut or veteran), series/volume authors, and voice-obsessed stylists who can get past a one-time key setup. **Who should wait:** anyone needing zero-config, free, or one-tap access — the casual/mobile hobbyist is actively failed by the double cost-and-jargon wall.

---

## 2. Grade table

| Persona | Who they are | Grade | One-line why |
|---|---|---|---|
| **Maya** — Debut Novelist | 28, first literary novel, no process, broke, scared of the blank page | **B (83)** | Write-first onboarding + teach-don't-scold coaching are exactly her lifeline — but the API-key wall is the precise moment a scared beginner leaves. |
| **Gerald** — Career genre novelist | 55, 30+ thrillers, deadline-driven, won't let AI touch or lose his words | **B+ (86)** | Bulletproof autosave, real docx export, opt-in AI, series sidebar — but the focus-mode loss window and pre-launch backups keep his live manuscript off it. |
| **Priya** — High-volume commercial author | Ships 6+ KU books/year, needs fast/cheap unattended drafting | **B- (75)** | Reliable, near-free draft loop + continuity graph are her business — but no batch processing, babysit-required gates, and a self-host-only stack cap it. |
| **Owen** — Literary stylist / poet | Slow, obsessive; voice is the whole game; assumes AI flattens him | **B+ (85)** | The anti-flattening line-editor prompt, argue-back loop, and no-fabrication honesty gate are A-work — held to B+ only because the output quality is unproven. |
| **Sam** — Casual weekend hobbyist | Phone-first fan-fic, no budget, zero patience for jargon | **D (40)** | Lovely mobile editor and real export, but the AI — the whole reason to come — sits behind a subscription + BYOK + jargon wall he'll never cross. |

### Overall grade: **B− (80)**

This is **not** the naive average (369 / 5 = 73.8, a C). The weighting reflects _how central each persona's need is to what wmb-pub is actually trying to be today_ versus _how well it serves that need_:

- **The four serious-author personas (Maya, Gerald, Priya, Owen) are the product's declared center of gravity** — a write-first companion for people committed to finishing a book. They average **82.25** and all four say "yes, I'd use it." That cluster is the real signal.
- **Sam is a real and valuable future segment, but not who the product is built for today** — it explicitly reads as "built for serious authors." His D is an honest indictment of the go-to-market gap (no free/managed tier), not of the core craft. Weighting his 40 equally would misrepresent the product's actual quality for its actual users.
- **Weighting:** serious-author cluster ~85% of the weight, casual/GTM segment ~15%. That yields ≈ `0.85 × 82.25 + 0.15 × 40 ≈ 76` on raw need-served, nudged up to **80 (B−)** because the four central personas each independently reached a confident _yes_ and praised deep, verified moats — but held below a straight B because two of those same personas flagged the same structural blockers (BYOK friction, pre-launch status, unproven edit quality, focus-mode loss). **A split verdict is the honest verdict: B+ craft, C− productization.**

---

## 3. Best fit / worst fit

**Best fit today: Gerald, the career genre novelist (B+ / 86).** The product's single most mature subsystem — version-stamped CAS autosave with 409 conflict UI, IndexedDB crash buffer, offline recovery, beforeunload flush, immutable snapshots — is built precisely for the writer whose non-negotiable is "don't lose my words." Add real (magic-byte-verified) docx export, genuinely opt-in AI (the full write-and-export path runs with the worker, Redis, and every LLM switched off), book-wide find/replace, transactional chapter reorder, and a cross-book series sidebar, and you have a tool that respects a professional's paranoia. He barely wants the AI, so BYOK is a shrug for him. The only things keeping him off it are the focus-mode loss window and its pre-launch status — both fixable, neither a craft failure.

**Worst fit today: Sam, the casual weekend hobbyist (D / 40).** Everything he can reach for free — a mobile editor and real export — he already has in Notes or Google Docs. Every feature that makes this "an AI writing companion" (ghost text, findings, the coach, the continuity net) sits behind a **double wall**: a monthly subscription (cheapest Founder $19/mo, no trial) _plus_ a separate BYOK account where he pays the LLM provider per token, gated behind a page of jargon ("BYOK," "OpenRouter," "AES-256-GCM at rest," "you pay Anthropic directly"). For a no-budget, phone-first, jargon-averse user, that's three dealbreakers stacked. He is not a flaw in the craft — he's the segment the product hasn't chosen to serve yet.

---

## 4. Cross-cutting strengths (the real moats)

1. **Write-first onboarding.** Praised by Maya, Priya-adjacent, and Sam alike: name a book → one click → typing in Chapter 1 in ~30 seconds, with style/architecture/bible offers arriving later as gentle, dismissible, fires-once toasts. Maya calls it "the whole ballgame." Even Sam, who bounces off everything else, loves it.
2. **Production-grade autosave / data-safety discipline.** Gerald read the actual save path and trusts it; it underpins Priya's confidence that write-chapter won't eat a draft at the budget cap (WriteChapter now in WRAP_UP_TOOLS, clampMaxTokens for qwen). This is the moat "every other AI writing app forgets."
3. **Voice-preserving, teach-don't-scold editorial architecture.** Owen (the harshest judge of this) calls the line-editor prompt "A-work": explicitly told _not_ to homogenize, rewrites must be "indistinguishable from the author's own revisions," voice-drift checked against the author's own metrics, AI-tell detection turned on the AI itself. Maya values the same thing as coaching that "teaches WHY a scene sags."
4. **Argue-back + memory loop, on your own model.** The "Let's talk about this" discuss thread runs the _cheap model of the user's own provider_ (verified in discuss-llm.ts by both Maya and Owen), adapts to pushback, and writes standing constraints into WriterMemory. This is the difference between a teacher and a grammar checker.
5. **Honesty as a design value.** Real streaks/word-counts (no hardcoded zeros), an honest 63% Story Health instead of a vanity 100%, and an AuthorshipTracker that _hides_ the readout rather than fabricate "100% yours." Owen's hard-fail provenance test passes; Maya, Sam, and Gerald all cite the honesty as trust-building.
6. **Cross-book series continuity net.** Gerald and Priya both flag this as a genuine, category-unique reason to choose it: a read-only character-state sidebar (24 entities verified in Neo4j) plus deterministic, zero-false-positive graph flags for dead-character/location/timeline contradictions.
7. **BYOK/qwen economics.** ~$0.16–0.42/chapter, honest model identity (billed for the qwen you chose, not Claude behind your back), and real cost tracking. Unbeatable for Priya's volume and survivable for broke Maya — the cost model is a strength _for those who can cross the setup wall_.

---

## 5. Cross-cutting gaps (shared weaknesses)

1. **BYOK with no zero-config / managed / free path.** Flagged by **all five**. Dealbreaker for **Maya** (scared, broke, non-technical — walks at "paste your API key") and **Sam** (jargon wall + double payment). A "small tax" for Gerald, a "self-host sysadmin burden" for Priya, a manageable prerequisite for Owen. This is the single most universal complaint and the clearest go-to-market blocker.

2. **Focus / immersive mode ~30-second content-loss window (S10, OPEN).** Flagged by **Maya, Gerald, Owen, and Sam**. Especially damning because it lives in the exact mode writers reach for to disappear into flow. Not a stated hard dealbreaker for anyone, but Gerald ("lose my words once and I'm gone") and Owen ("those were my best 30 seconds") both say it's the kind of hole that ends the relationship the first time it bites.

3. **Editorial / beta-read QUALITY on real prose is unproven.** Flagged by **Maya, Owen, and Priya**. The craft _machinery_ is A-grade and verified-wired; the _output_ on a real literary page has never been shown. Owen: "the instructions are A-work and the proof is still missing." For a voice-first writer this is the one thing standing between B+ and A; for Priya it risks being "an editorial pass that's theater I'm paying for."

4. **Pre-launch / unproven ops.** Flagged by **Gerald and Priya** (and underpins Sam's "in production a 'none' plan can't even create a book"). Prod DB push, backup-restore drill, and live Stripe/Clerk are open gates. Gerald won't move a live manuscript onto unproven backups; Priya can't "just subscribe."

5. **qwen fragility in the structured contracts.** Flagged by **Gerald, Priya, and Owen**. Strict CreateFinding validation (verbatim anchor ≥0.8, 2–3 alternatives, 23-category enum) burns qwen turns on rejections and can yield thin output; entity-extraction JSON sometimes fails, leaving the continuity graph incomplete; the beta gate hinges on fragile markdown parsing that can silently stall the revise loop. A partial graph "gives false confidence."

6. **No batch / overnight processing + babysit-required gates.** Priya's biggest throughput miss (roadmap 4.6, unshipped): every workflow is one chapter at a time, and approval gates auto-reject at 10 minutes, so she can't walk away mid-draft. Attribute-level series drift (rank/title changes like "became a Major in Ch 15") also isn't graph-tracked yet — the flagship example the feature can't catch.

7. **Export finish + polish bugs.** Gerald hit broken chapter titling (4 of 5 chapters untitled) and a ~47% page-estimate error; Sam hit a locale leak rendering "2.026 words." The binaries are real; the finish on the deliverable and the small trust-signals aren't there yet.

---

## 6. Highest-leverage improvements by segment

_The 4–6 changes that would move the most grades, tagged with whom they unlock._

1. **Ship a managed / one-tap key path (or a small free/hosted word allowance) — kill the BYOK cliff.** → Unlocks **Sam (D→C+/B), Maya (removes her one dealbreaker, 83→low-A), and lowers Priya's ops burden.** This is the highest-leverage single change in the entire evaluation: it's the one gap every persona named and the only dealbreaker for the two lowest grades. A "none-plan can't create a book" plus a jargon wall is the whole distance between "built for serious authors" and "a product anyone can start."

2. **Close the focus/immersive-mode ~30s loss window (S10) — route it through the hardened CAS path.** → Unlocks trust for **Gerald, Owen, Maya, and Sam.** Four personas named it; two call it relationship-ending. Bringing the mode writers most want to use up to the same autosave discipline as the default editor removes a trapdoor with no upside.

3. **Prove editorial/beta-read quality on a real literary page — publish a before/after voice-preservation demo.** → Unlocks **Owen (B+→A, his explicit condition), Maya's trust on her "most precious pages," Priya's editorial-pipeline confidence.** The machinery is verified-wired and the prompt is A-work; the missing artifact is one real page showing it sharpens rather than flattens. This converts architecture into trust.

4. **Harden the qwen structured-output path — reduce CreateFinding rejection churn and make entity-extraction JSON robust.** → Unlocks **Priya, Owen, Gerald.** On the cheap BYOK config people will actually run, thin/expensive findings and an incomplete continuity graph undercut two of the biggest moats. Robust parsing + graceful degradation (and surfacing when the graph is partial) turns "false confidence" into a dependable net.

5. **Finish the launch: prod DB push, a proven backup-restore drill, and live Stripe/Clerk.** → Unlocks **Gerald and Priya** (both explicitly withholding live manuscripts / subscriptions until this closes). These are gates, not craft — but they're the difference between "a tool I'd use once it launches" and "a tool I use."

6. **Batch/overnight processing + walk-away approval gates (roadmap 4.6) and attribute-level series drift tracking.** → Unlocks **Priya (B−→B+/A)**, the one persona whose whole business is bulk throughput. "Dev-edit chapters 5–12 and show me a delta report," gates that don't auto-reject when she leaves the keyboard, and graph tracking of rank/status creep would turn her "drafting tool pretending it isn't a sysadmin" into a genuine book factory.

_Lower-cost polish that punches above its weight: fix export chapter-titling + page estimate (Gerald), fix the "2.026 words" locale leak (Sam), and surface the structure/outline map beside the editor instead of in a separate Library (Maya)._

---

## 7. The five standout lines

- **Maya (Debut Novelist):** "It finally let me just start writing and then talked to me like a mentor instead of a red pen — but it asked me for an API key before it ever said hello, and that's the exact moment a scared, broke beginner like me walks away."

- **Gerald (Career genre novelist):** "It finally understands the one thing every other 'AI writing app' forgets — that my job is to write the book and its job is to not lose it — and then it leaves a trapdoor in the very mode I'd most want to write in."

- **Priya (High-volume commercial author):** "The engine drafts fast and cheap and finally won't eat my chapter at the budget cap — but until it can batch-edit twelve chapters overnight without me babysitting a worker process, it's a brilliant drafting tool pretending it isn't asking me to also be its sysadmin."

- **Owen (Literary stylist / poet):** "This is the first AI writing tool whose editor is explicitly told never to homogenize me and to make its rewrites indistinguishable from my own revisions — now show me one real page where it actually keeps that promise, because the instructions are A-work and the proof is still missing."

- **Sam (Casual weekend hobbyist):** "The moment I want to actually write WITH the AI, it hands me a subscription bill and a homework assignment to go get an 'API key' — and that's where weekend-me quietly closes the tab."
