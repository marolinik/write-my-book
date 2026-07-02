# Write My Book — Path to #1 Writer Platform

*Assessment date: 2026-06-10, based on codebase survey at commit `2ceff41`.*

> **Progress — updated 2026-07-02.** **Tier 1 fully wired**, **Tier 2 complete**, and
> **Tier 4.1 + 4.2 shipped.** Tier 2: 2.1 autosave optimistic locking, 2.2 offline draft
> buffer, 2.3 cost-limit degradation, 2.4 mobile editor, 2.5 accessibility (WCAG 2.1 AA),
> 2.6 unit tests (Vitest harness + money-path coverage), 2.7 repo hygiene. **Tier 4.1**
> write-first onboarding and **Tier 4.2** conversational findings both built the full
> pipeline (spec → adversarial verify → plan → subagent build → review) and merged to main
> (75 unit tests total). **Next:** Tier 4.3/4.4 ambient continuity, 4.8 The Shelf, 4.6
> power-user depth, and/or Tier 3 moats.

**Verdict: ~65/100 production-ready. The bones of a 9/10 product delivering a 6.5/10 experience — mostly because already-built subsystems aren't wired together.** The fastest path to #1 isn't new features; it's connecting what exists, then closing 3 competitive gaps.

---

## Tier 1 — Wire what's already built (days each, massive perceived-quality gain)

### 1.1 Inject craft skills into agent prompts ⚡ biggest quick win
`src/lib/agents/skills/writing-craft.ts`, `genre-guides.ts`, `advanced-craft.ts` (≈960 lines of AI-tell detection, narrative technique, publishing standards) are **never imported anywhere**. The line-editor and dev-editor run blind without their core reference material. One conditional section in `prompt-assembler.ts` fixes this.

### 1.2 Make vector memory actually reach agents
`src/lib/vector/retriever.ts` retrieval runs, but results don't reliably land in the final assembled prompt (`prompt-assembler.ts:1777-1799`); memory is disabled by default for most agents. Enable for all agents with archive access; tune score threshold (0.75 → ~0.65).

### 1.3 Writer memory & preferences are stored but ignored
`formatWriterMemoryForPrompt()` (`writer-memory.ts:100-127`) has **no call site** in prompt assembly. Writers say "I prefer short sentences" and agents never see it. This is the single worst trust-breaker.

### 1.4 Close the feedback loop
`suggestion-feedback.tsx` posts thumbs up/down; there's no handler that does anything with it. Pattern: 3+ dismissals of a finding category → auto-constraint in writer memory → next session respects it. "The AI learns your style" becomes true, and it's the #1 marketing claim competitors can't easily copy.

### 1.5 Fix the dead gamification loop
`currentStreak: 0` and `todayWords: 0` are **hardcoded** in `src/app/(app)/books/[bookId]/page.tsx:525`. Proactive notifications, milestone rewards, and Year-in-Writing-Wrapped all depend on these — the entire motivation system is decorative. Compute from document version history + a daily word-count table. Move writing-sprints from localStorage to DB while at it.

### 1.6 Expose built--but-hidden editor features
- Immersive focus mode (`immersive-focus-mode.tsx`) — no toolbar entry point
- AI ghost text (`ai-ghost-text.tsx`) — built, trigger/hotkey unclear
- Rewrite comparison, entity @mentions, version branching — built, exposure unclear
Audit each: wire it or remove it. Half-visible features read as "broken product."

### 1.7 Verify radar & daily-plan backends are real
`story-radar.tsx` and `daily-writing-plan.tsx` UIs are polished; confirm `/api/books/[id]/radar` and `/daily-plan` return real agent analysis, not templates. If not ready, hide the widgets — fake AI insight destroys trust faster than missing features.

---

## Tier 2 — Production blockers (before scaling/marketing)

### 2.1 Autosave conflict safety (data-loss risk)
2s-debounce autosave with last-write-wins; two tabs editing the same chapter silently lose work. Add optimistic locking (version stamp on PUT, 409 + conflict UI). **For a writing tool, losing a writer's words once is fatal to trust.**

### 2.2 Offline resilience
No service worker, no sync queue. Network blip during autosave = silent loss while the writer keeps typing. Minimum: local draft buffer (IndexedDB) + sync-on-reconnect + "unsaved changes" indicator.

### 2.3 Graceful cost-limit degradation
`orchestrator.ts:438-445` hard-kills sessions at $10 with no partial results. Offer: save findings so far / switch to cheaper model / continue. Also: approval gates only work for foreground sessions (`approvalResolver` for background jobs unimplemented — `orchestrator.ts:528-577`).

### 2.4 Mobile editor
Fixed 680px 3-panel layout is unusable on phones. Collapsible panels + responsive typography. Tablet/phone writing is a large and growing segment; every major competitor has it.

### 2.5 Accessibility
Zero ARIA attributes in the editor; keyboard nav is only F2/F8. WCAG 2.1 AA baseline: labels, focus management, keyboard-complete editor.

### 2.6 Unit-test the money paths
182 E2E cases but zero unit tests on autosave logic, orchestrator, billing gating. E2E-only means slow CI and blind spots in exactly the logic that loses user data or money.

### 2.7 Repo hygiene
28 `tmp-*` files, `test-results/` (incl. a 45k-line PDF), `uat-screenshots/`, `playwright-report/` are committed. Purge + `.gitignore`.

---

## Tier 3 — Competitive moats (the "#1 platform" plays)

| Gap | Competitors | Play |
|-----|------------|------|
| **Collaboration** | Atticus, NovelCrafter have it | Phase 1: share read-only link + inline comments (no CRDT needed). Phase 2: editor seats. Unlocks co-authors, beta readers, agent/editor workflows — and the Publisher tier's actual value. |
| **Templates/scaffolding** | Sudowrite generates scaffolds | You already have story-architect agents — package genre templates (three-act, romance beats, mystery clue tracking) as one-click setup paths. Mostly productizing existing agents. |
| **Series depth** | Weak everywhere — open moat | Cross-book continuity agent + series sidebar in the editor. Fantasy/romance series writers are the highest-LTV segment and underserved by everyone. |
| **Graph-aware consistency** | Nobody has this | Neo4j graph exists but agents only see flat entity lists. Give dev-editor a QueryGraph tool for timeline/character-state contradictions. "Catches retcons automatically" is a headline feature. |
| **Agent quality evals** | Invisible but compounding | No regression testing of agent output exists. Build a small eval set (manuscripts + known issues) so model/prompt changes don't silently degrade quality. |

---

## Tier 4 — Experience vision: make it feel alive, not compliant

*The strategic frame: the moment a writer thinks "the app understands what I'm trying to do" instead of "the app is checking my work," we've won. Reconciled against the codebase — some of this is closer than it looks.*

### 4.1 Write-first onboarding (kill the setup tax) — ✅ SHIPPED 2026-07-02
**Shipped:** new book lands the writer directly in a blank Chapter 1 editor; a non-blocking Sonner toast offers style/architecture/bible workflows at 2K/5K/10K words (once ever; ignore→pill on the companion bubble, dismiss→gone); the 6-step wizard is now an opt-in "Guided setup" button. Trigger logic is a pure, unit-tested `computeOnboardingOffers`; the hardened autosave editor was untouched.

**Original target ↓**
**Today:** `/books/new` forces a choice between import and describe-to-coach; the 6-step setup wizard (`/books/[bookId]/setup`) leads. **Target:** New book → blank editor → start typing. Pipeline follows, doesn't lead:
- ~2K words: "I've read enough to understand your voice — build a style fingerprint?" (passive capture on first 500 words)
- ~5K words: offer architecture; ~10K: offer story bible
- Setup wizard remains as the power-user path, never a wall.
**Build note:** all the agent workflows exist; this is re-sequencing triggers + a word-count threshold watcher on autosave.

### 4.2 Conversational findings (collaborator, not judge) — ✅ SHIPPED 2026-07-02
**Shipped:** each finding opens a bounded 3-turn dialogue via a new lightweight `/discuss` endpoint (single haiku turn, atomic turn-cap + 200/24h rate limit, no orchestrator). `FindingConversation` mounts in the editor tooltip→sheet and the editorial card, rendering the agent's revised suggestion in-place via the now-exposed `AIRewriteComparison` (edit + mobile modes). `[Use it] [Use it but edit] [Keep as-is]` — and "Let's talk about this" persists a role-tagged `FindingReply` thread. On keep-as-is, the agent emits one constraint, **server-scoped to the finding's own book** (prompt-injection-safe), feeding the Tier-1.4 loop. Adversarially spec-reviewed (19 defects folded) + final whole-branch review verified all 5 security invariants. Deferred: unread toast/pill, cross-device read-state.

**Original target ↓**
**Today:** findings UI is apply/dismiss binary; `grep` confirms zero chat surface in `src/components/editorial`. **Target:** each finding opens a dialogue:
> Dev Editor: "Tension dips at beat 4. Here's the two sentences I'd add — want to see them in place?"
> `[Use it] [Use it but edit] [Keep as-is] [Let's talk about this]`

"Let's talk about this" is the killer option: writer explains intent ("she's evasive on purpose"), agent adapts ("then hint at it one line earlier"). This is also the **highest-quality training signal** — conversational rejections beat binary thumbs (supercharges 1.4). Suggestions render **in-place in the editor** (rewrite-comparison component already exists, unexposed — 1.6), never auto-apply.

### 4.3 Ambient series awareness (proactive, not button-push)
**Today:** continuity check is an end-of-process report; series docs live on a separate page. **Target:** while writing Book 2 Ch 7, a sidebar surfaces character state from Book 1 ("Milan — last seen B1 Ch18, rank Captain, distrusted by council, open thread: what does he know?"), tone drift (sentence-length vs series fingerprint), and open plot threads. Lightweight: vector search (Qdrant, wired via 1.2) + entity lookup (Neo4j) — **no 20-minute agent run**. Arc changes write back a continuity note, not a re-analysis.

### 4.4 Live continuity safety net (in-book, real-time)
Same machinery as 4.3 scoped to a single book: as the writer types "Milan entered in his Captain's uniform," a non-blocking flag — "Milan became a Major in Ch 15. [Fix here] [Change Ch 15] [Intentional]". Regex + embeddings against prior chapters; runs in the background on autosave.

### 4.5 Own the journey to publication (export → publishing)
- **Beta reader links:** shareable read-only chapter links + anonymous per-chapter feedback, aggregated ("8 of 12 readers felt pacing dragged at beat 4"). Doubles as collaboration phase 1 (Tier 3).
- **Market positioning brief:** comp titles, agent wish-list, submission strategy. **Partially built** — `marketing-kit/route.ts` (226 lines) already generates positioning material; productize as a premium artifact ($50–200 one-off = new revenue stream + stickiness).
- **Agent-submission checklist** (word count, comps, blurb, pitch, 5 pages, readiness checks — `src/lib/readiness.ts` exists) and later self-pub flow (KDP/IngramSpark).

### 4.6 Power-user depth (stop hand-holding serious writers)
- ✅ **Already built:** per-agent model selection (4-level resolution chain, book settings) — just market it.
- **Raw session logs toggle:** AgentSession messages are already persisted; add "show me what the dev editor actually thought" view.
- **Context transparency:** "here's exactly what I fed the agent" — prompt-assembler sections rendered as an inspectable tree. Differentiating trust feature; nobody else shows this.
- **Batch processing:** "dev edit chapters 5–12 overnight, show delta report" — queue/worker infra exists; needs multi-chapter session type + digest report.
- **Artifact export:** story bible / architecture / character registry as structured JSON-LD for Scrivener/Notion interop.

### 4.7 Language as lock-in
i18n plumbing exists (`SUPPORTED_LANGUAGES`, per-book language). Lean in: a Serbian writer gets agent prompts tuned to Serbian literary tradition, em-dash dialogue conventions, beta personas with local cultural touchstones. Per-language craft packs slot into the skills system (1.1) once it's wired. Not available anywhere else; defensible IP.

### 4.8 The Shelf (writing ritual, not SaaS grid)
Reframe the dashboard around project *states*: **Currently Writing** (continue → last chapter, cursor position), **Waiting for Feedback** (dev edit 4/18 chapters), **Completed** (exported), **Archived**. Data already exists (sessions, statuses, timestamps); this is an emotional-design reframe of `dashboard/page.tsx`. Writers are sentimental about projects — treat that seriously.

---

## Suggested sequence

1. **Week 1–2:** Tier 1 wiring (1.1–1.4 are prompt-assembler + one API handler; 1.5–1.7 are small). This alone transforms perceived AI quality — and it's the prerequisite for everything in Tier 4 (conversational findings need the feedback loop; ambient series needs wired vector memory; language packs need the skills system).
2. **Week 3–4:** 2.1–2.3 (data safety + cost UX) + 2.7 hygiene. Now safe to put real writers on it.
3. **Month 2:** **4.1 write-first onboarding + 4.2 conversational findings** — the two highest-leverage experience changes — alongside mobile/a11y/unit tests (2.4–2.6).
4. **Month 3:** 4.3/4.4 ambient continuity (the moat), 4.8 Shelf, 4.6 power-user depth (mostly exposing what exists).
5. **Month 4+:** 4.5 publication journey (beta links → market brief → submission), 4.7 language packs, full collaboration.

**One-line strategy:** connect the existing intelligence to the agents, make the platform incapable of losing a writer's words, then make it *feel alive* — write-first, conversational, ambiently series-aware — and win on the continuity moat + publication journey nobody else can match.
