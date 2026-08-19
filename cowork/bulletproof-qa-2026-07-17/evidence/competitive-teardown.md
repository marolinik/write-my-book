# Competitive Teardown — Write My Book (wmb-pub)

**Date:** 2026-07-17
**Purpose:** Feed the bulletproof-QA campaign's defect-priority. Honest gap-finding, not marketing. Every pricing/capability claim is cited; anything unverifiable is tagged `(unverified)`. wmb-pub's actual capabilities are grounded in the codebase (see `docs/mission/product-map.md`, `docs/mission/key-facts.md`), **not** its README claims — where the app is broken or fake, this doc says so.

---

## wmb-pub capability baseline (what it actually does today, honestly)

Grounded in the code exploration, not the pitch:

**Real moats (shipped & working):**
- **BYOK, mandatory, 5 providers** — Anthropic / OpenRouter / OpenAI / Gemini / Grok, ~37 model ids, keys **live-validated** against the provider before save. Transparent per-model / per-key / per-book cost tracking with **cost-drift detection** (`GET /api/usage` → `costDrift`, price-discrepancy flags).
- **Voice-preserving editorial loop** — dev-edit / line-edit / beta-read agents produce **quote-anchored findings** (fuzzy anchor ≥0.8, NFC-normalized for Serbian, dedup by content hash, grounding score), with apply / dismiss / undo / **discuss** lifecycle, and a **WriterMemory learning loop** (5-dismissal preference inference). Prompts carry a style **fingerprint + voice_metrics + calibration**. This is the best-engineered part of the system.
- **Cross-book series continuity** — Neo4j graph (character-network, timeline, location-map, plot-threads, chapter-entities, consistency-checks) + ambient series panel + live continuity net (scan on chapter switch + 20s idle, inline flags, mark-intentional). Qdrant vector memory (optional; needs platform OpenAI key).
- **Production-grade data safety** — 2s-debounce autosave, optimistic locking (409 conflict machinery), IndexedDB crash buffer, offline support, version history with diff/restore.
- **Honest metrics** — writing heatmap/streaks backed by real per-day word deltas.
- Editor: TipTap, ghost text (Tab), F2 inline edit (3 suggestions), focus/typewriter modes, split view. Export docx/pdf/epub via Pandoc+typst. Import wizard. 14 UI languages (7 full). Overnight/batch workflows on BullMQ Flows. Shelf (books grouped by state).

**Honest weaknesses (from the code, not the brochure):**
- **Revise/restructure is the weakest stage**: chapter reorder is *broken* (corkboard → 404 on a nonexistent route; canvas → P2002 unique-constraint races). **No find & replace anywhere.** No scene management beyond an `<hr>`. No author annotations/TODOs. No outline/synopsis view (no synopsis field exists). Word targets render in 4 places, settable in 0.
- **No proprietary fiction-tuned model** — quality is whatever BYOK general model the user brings.
- **No real-time collaboration, no templates** (Tier 3, unshipped). **No native mobile/desktop apps** (responsive web only). No deterministic grammar/spell engine. No image generation. No plagiarism check.
- **Export is thin & unexercised** — rated "works-but-rough" but never smoke-tested end to end.
- **Model-identity dishonesty (live defect)**: the Coach/conductor is force-run on `${provider}/sonnet` regardless of the user's chosen model; discuss threads hardcoded to Claude Haiku. Some widgets are fake (AuthorshipTracker always "100% human"; Story Radar/Daily Plan are heuristic placeholders labeled as "AI monitoring").
- **Infra-heavy** — Postgres + S3 + Redis required; Neo4j/Qdrant optional; a separate BullMQ worker must run or six core workflows hang forever with no error.

---

## 1. Sudowrite

**What it is + pricing.** The best-known AI-native fiction studio: drafting (Write/Expand/First Draft), Story Bible, Story Engine (full-novel generation, v3.0 in 2026), Canvas brainstorming board, and craft micro-tools/plugins. Its headline differentiator is **Muse 1.5**, a proprietary LLM fine-tuned specifically on published novels (publicly available mid-2025), alongside "Excellent" (Claude 3.7 Sonnet) and "Basic" (GPT-4o mini) modes. **Credit-based subscription**: Hobby $10/mo annual ($19 monthly, ~225k credits), Professional $22/mo annual ($29 monthly, ~1M credits), Max ~$44/mo annual (~2M credits, rollover). All features on every tier; only credit volume differs. Free trial = 10,000 credits, no card, not time-limited. ([builtwritten](https://www.builtwritten.com/blog/sudowrite-ai-2026), [skywork](https://skywork.ai/blog/sudowrite-review-2025-story-engine-describe-pricing/), [costbench](https://costbench.com/software/ai-writing-tools/sudowrite/))

| Capability | Sudowrite | wmb-pub | Verdict |
|---|---|---|---|
| Zero-setup managed AI (no API key) | Yes — bundled credits | No — BYOK mandatory | **DELIBERATELY-DIFFERENT** (BYOK is the moat, but it's friction for this exact buyer) |
| Proprietary fiction-tuned model (Muse) | Yes | No — general BYOK models only | **REAL-GAP-TO-CLOSE** (can't be closed cheaply; mitigate via prompt craft) |
| Story bible / canon memory | Story Bible | Story Bible + Neo4j graph + vector memory | **MATCH** (wmb-pub deeper on series) |
| Full-novel auto-generation | Story Engine 3.0 | write-chapter workflow (queues to worker) | **MATCH** (Sudowrite more polished/one-click) |
| Visual brainstorming board | Canvas 2.0 | corkboard/canvas (reorder broken) | **REAL-GAP-TO-CLOSE** (wmb-pub's canvas is broken) |
| Custom voice model | My Voice (beta, trains on samples) | Voice fingerprint injected into prompts (not a trained model) | **DELIBERATELY-DIFFERENT** |
| Transparent per-call cost | Opaque credits, "credit anxiety" | Exact USD, cost-drift detection | **wmb-pub wins** |
| Line-level editorial findings loop | Rewrite/Quick Edit (inline) | Quote-anchored findings + discuss + WriterMemory | **wmb-pub wins** |

**The one thing that keeps a writer on Sudowrite:** **Muse** — a house model that actually writes fiction (scene blocking, dialogue rhythm, genre-aware prose) with **zero setup and zero key management**. A hobbyist who just wants to type a prompt and get novel-grade prose has no equivalent in wmb-pub, whose output quality is capped by whatever general model the user wires up.

---

## 2. NovelAI

**What it is + pricing.** A privacy-first storytelling + anime-image platform running its own text models (Kayra-13B, Llama-3 Erato 70B, and the newer Xialong on the top tier). Selling points: **unlimited text generation on all paid tiers** for a flat fee, encrypted stories, minimal content filtering, the **Lorebook** (keyword-triggered dynamic memory), TTS, and image generation. Three tiers: **Tablet $10/mo** (16,384-char memory, Kayra-13B), **Scroll $15/mo** (32,768-char memory, Erato 70B), **Opus $25/mo** (largest context ~28,672 tokens, exclusive models, 10,000 Anlas). Free "Paper" trial: 50 text + 30 image gens. ([docs.novelai.net/subscription](https://docs.novelai.net/en/subscription/), [aitoolsdevpro](https://aitoolsdevpro.com/ai-tools/novelai-guide/), [docs.novelai.net/text/models](https://docs.novelai.net/en/text/models/))

| Capability | NovelAI | wmb-pub | Verdict |
|---|---|---|---|
| Unlimited flat-rate generation | Yes ($10–25/mo, no metering) | No — pay per token via BYOK | **DELIBERATELY-DIFFERENT** (but a real loss for volume writers) |
| Own text models, no key needed | Yes | No — BYOK | **DELIBERATELY-DIFFERENT** |
| Privacy / encrypted stories, no content filter | Yes (a core promise) | Local-ish; user's key, user's data; no explicit encryption-at-rest claim | **DELIBERATELY-DIFFERENT** (unverified whether wmb-pub encrypts prose at rest) |
| Keyword-triggered lore injection | Lorebook | Neo4j graph + priority-ranked prompt assembler (auto-selected, not keyword-gated) | **MATCH** (wmb-pub's is automatic/deeper) |
| Long-context memory | ~28k tokens (Opus) | 60k–150k prompt budgets; qwen 262k ctx | **wmb-pub wins** |
| Image generation | Yes (anime) | No | **DELIBERATELY-DIFFERENT** (not core for serious novelists) |
| Structured editorial/continuity net | No | Yes | **wmb-pub wins** |
| Multi-book series continuity | No | Yes | **wmb-pub wins** |

**The one thing that keeps a writer on NovelAI:** **Unlimited generation at a fixed $10–25/month with strong privacy and no content filter.** A high-volume writer (or one writing sensitive/adult content) gets predictable cost and zero moderation friction. wmb-pub's per-token BYOK meter is the opposite psychology, and it makes no privacy/no-filter promise.

---

## 3. Novelcrafter

**What it is + pricing.** wmb-pub's **most direct competitor** — a novel-writing environment built around the **Codex** (an intelligent story bible: characters, locations, items, lore, with aliases, progressions, relations, and automatic mention-tracking across the manuscript) plus **BYOK AI**. Four tiers, all with unlimited books + Codex + series support: **Scribe $4/mo** (no AI), **Hobbyist $8/mo** (first BYOK-AI tier), **Artisan $14/mo** (Workshop Chat), **Specialist $20/mo** (collaboration/teams). BYOK connects OpenAI, Anthropic, Gemini, Mistral, OpenRouter, and **local models via Ollama/LM Studio** (zero AI cost), plus fixed-rate providers (Featherless/Infermatic/Arli) for "unlimited" flat AI. 21-day full trial, no card. ([novelcrafter.com/pricing](https://www.novelcrafter.com/pricing), [toolworthy](https://www.toolworthy.ai/tool/novelcrafter), [dreamgen](https://dreamgen.com/blog/articles/novelcrafter-review))

| Capability | Novelcrafter | wmb-pub | Verdict |
|---|---|---|---|
| BYOK, multi-provider | Yes (+ Ollama local, + fixed-rate) | Yes (5 providers; no local/Ollama path) | **MATCH** (Novelcrafter wider: local + flat-rate options) |
| Story-bible with auto mention-tracking | Codex (aliases, relations, progressions, auto-mention) | Neo4j graph + entity extraction; **entity-mention popup exists but is unwired** | **REAL-GAP-TO-CLOSE** (in-editor mention-tracking not shipped) |
| Series/shared bible across books | Yes | Yes (Neo4j series graph, ambient panel) | **MATCH** |
| Real-time collaboration / co-author + editor | Specialist tier | **No** (Tier 3, unshipped) | **REAL-GAP-TO-CLOSE** |
| Local model support (zero AI cost) | Ollama / LM Studio | No | **REAL-GAP-TO-CLOSE** |
| Flat-rate "unlimited" AI option | Yes (Featherless etc.) | No | **REAL-GAP-TO-CLOSE** (volume writers) |
| Voice-preserving line-editor findings loop | Workshop Chat + prompts (no anchored-findings lifecycle) | Quote-anchored findings + WriterMemory | **wmb-pub wins** |
| Live continuity net (auto scan) | No (Codex is passive reference) | Yes | **wmb-pub wins** |
| Product maturity / polish | High (years shipping) | Newer; revise stage broken | **REAL-GAP-TO-CLOSE** (maturity) |

**The one thing that keeps a writer on Novelcrafter:** The **mature, polished Codex + collaboration + local-model** package. It's the same BYOK philosophy wmb-pub bets on, but shipped longer, with real-time co-authoring, Ollama (write for free), and a Codex whose auto-mention-tracking is fully wired — while wmb-pub's equivalent entity-mention UI sits as dead code and its restructure tooling is broken.

---

## 4. Scrivener (+ Plottr)

**What it is + pricing.** **Scrivener** is the 20-year-incumbent writing environment: Binder, **Corkboard** (index cards = manuscript sections, synopses, drag-to-reorder), Outliner, Snapshots, and a powerful **Compile** engine (docx/PDF/EPUB/MOBI/Final Draft). **One-time** $59.99 (macOS or Windows, separate licenses), $23.99 iOS, $95.98 bundle; 30-day trial. No AI. **Plottr** is the complementary visual planner: a horizontal **timeline** grid of scene cards across parallel plotlines, 30+ structure templates (Save the Cat, Hero's Journey…), Scrivener export. $60/yr or $199 lifetime; Pro tier adds cloud sync + real-time collaboration. ([scrivener.software](https://scrivener.software/), [propicked](https://propicked.com/ai-tools/scrivener/pricing), [plottr.com/pricing](https://plottr.com/pricing/), [reedsy](https://reedsy.com/blog/guide/book-writing-software/plottr-review/))

| Capability | Scrivener+Plottr | wmb-pub | Verdict |
|---|---|---|---|
| Corkboard reorder = manuscript reorder | Yes (rock-solid, 20 yrs) | **Broken** (404 / P2002 races) | **REAL-GAP-TO-CLOSE** (live defect) |
| Synopsis on each card / outline view | Yes (index-card synopses ↔ Outliner) | **No synopsis field; no outline view** | **REAL-GAP-TO-CLOSE** |
| Find & replace (incl. project-wide) | Yes | **No** | **REAL-GAP-TO-CLOSE** |
| Scene-level management | Yes (nested docs) | Only `<hr>` scene breaks | **REAL-GAP-TO-CLOSE** |
| Visual timeline / parallel plotlines | Plottr timeline | No timeline view | **REAL-GAP-TO-CLOSE** (series) |
| Plot-structure templates / beat sheets | Plottr 30+ | **None** | **REAL-GAP-TO-CLOSE** (debut/hobbyist) |
| One-time purchase / own-forever / offline | Yes ($60 once) | No (hosted, infra-dependent) | **DELIBERATELY-DIFFERENT** |
| Snapshots / version history | Snapshots | Version history + diff/restore | **MATCH** |
| Compile to multiple formats | Mature Compile | Pandoc export (thin/unexercised) | **REAL-GAP-TO-CLOSE** (maturity) |
| AI assistance | **None** | Full agent suite | **wmb-pub wins** |

**The one thing that keeps a writer on Scrivener:** **Bulletproof manuscript organization you own outright for $60, offline, forever** — the Corkboard/Binder/Compile trio that has survived two decades of authors. A pro restructuring a 30-chapter novel gets frictionless drag-reorder, synopses, and find-and-replace; in wmb-pub that same author hits a 404 on reorder and has no find-and-replace at all.

---

## 5. Atticus / Vellum

**What it is + pricing.** Publishing's **formatting** end-stage, not writing tools. **Vellum** (Mac-only) produces the industry's most polished print/ebook typography (kerning, hyphenation, page flow), exports EPUB/PDF/DOCX(+MOBI), platform-specific ebook files for wide distribution; **$249.99** full (ebook+print), one-time, pay-on-first-export. **Atticus** (web/cross-platform: Windows, Mac, Linux, Chromebook, cloud-sync) bundles writing + formatting for **$147 one-time**, everything included, 30-day money-back. ([kindlepreneur](https://kindlepreneur.com/atticus-vs-vellum/), [brighterapublishing](https://brighterapublishing.com/vellum-vs-atticus-which-book-formatting-software-is-worth-your-money-in-2025/))

| Capability | Atticus/Vellum | wmb-pub | Verdict |
|---|---|---|---|
| Professional print typography | Vellum (best-in-class) | Pandoc+typst pipeline, unexercised | **REAL-GAP-TO-CLOSE** |
| KDP/wide-ready ebook export (EPUB per-retailer) | Yes | epub via Pandoc (untested) | **REAL-GAP-TO-CLOSE** |
| Themes / fonts / callouts customization | Extensive (Atticus + Google Fonts) | EXPORT-CONFIG (glyph, template) — thin | **REAL-GAP-TO-CLOSE** |
| One-time price / own-forever | Yes | No | **DELIBERATELY-DIFFERENT** |
| Writing environment | Atticus yes; Vellum no | Yes (full AI suite) | **wmb-pub wins** (vs Vellum) |
| AI drafting/editing | **None** | Yes | **wmb-pub wins** |

**The one thing that keeps a writer on Vellum/Atticus:** **Publish-ready, beautiful formatting** — the last mile of self-publishing. Every serious indie author needs this before hitting KDP, and wmb-pub's export is a thin, never-smoke-tested Pandoc path. Even a writer who drafts entirely in wmb-pub will *still* pay $147–$250 for a formatter, because wmb-pub can't yet produce a bookstore-grade file.

---

## 6. ProWritingAid / Grammarly

**What it is + pricing.** Deterministic **grammar/style checkers** that live everywhere (browser extensions across 500k+ sites, Word/Docs add-ins). **Grammarly**: clarity/tone/conciseness, unlimited AI rewrites (fair-use), unlimited plagiarism; Premium ~$12/mo annual ($144/yr) / $30 monthly; solid free tier (100 AI prompts/mo). **ProWritingAid**: fiction-focused, **20+ analysis reports** (pacing, dialogue tags, sentence variety, echoes), "Sparks" AI (rewrites + chapter critiques); after a 2026 restructure, Premium $120/yr ($10/mo annual, $30 monthly), Premium Pro $144/yr (more AI), **$399 lifetime**; free tier limited to 500 words. ([manuscriptreport](https://manuscriptreport.com/blog/prowritingaid-vs-grammarly), [zapier](https://zapier.com/blog/prowritingaid-vs-grammarly/), [saaspricepulse](https://www.saaspricepulse.com/tools/prowritingaid))

| Capability | PWA/Grammarly | wmb-pub | Verdict |
|---|---|---|---|
| Deterministic grammar/spell engine | Yes (rule-based, consistent) | No — LLM findings only (non-deterministic) | **REAL-GAP-TO-CLOSE** |
| 20+ craft-analysis reports (pacing/dialogue/echoes) | PWA yes | Partial — editorial findings, no quantified reports | **REAL-GAP-TO-CLOSE** (stylist) |
| Works everywhere (browser/Word/Docs) | Yes | No — inside wmb-pub only | **DELIBERATELY-DIFFERENT** |
| Tone detection | Grammarly | Voice metrics (different framing) | **MATCH** (approx) |
| Plagiarism check | Grammarly unlimited | No | **REAL-GAP-TO-CLOSE** (minor) |
| Voice-preserving, context-aware line edits | Generic rewrites | Quote-anchored, fingerprint-aware, learns preferences | **wmb-pub wins** |
| Whole-manuscript + series context | No (sentence/doc scope) | Yes | **wmb-pub wins** |

**The one thing that keeps a writer on ProWritingAid/Grammarly:** A **deterministic grammar/mechanics safety net + quantified craft reports that follow you into every app**. A stylist wants the same reliable comma/echo/pacing pass on their blog, email, and manuscript — wmb-pub only edits inside its own editor, with LLM output that varies run-to-run instead of a stable rules engine.

---

## 7. ChatGPT (Projects + custom instructions) / Claude raw

**What it is + pricing.** The frontier chatbots themselves, used as writing partners. **ChatGPT Plus $20/mo**: **Projects** (persistent workspaces = instructions + files + chat history), **custom instructions up to 5,000 chars** (raised from 1,500 in 2026), two-layer **memory** (saved memories + reference chat history), Custom GPTs, image gen, voice, data analysis. **Claude Pro $20/mo**: Projects with a 200K-context knowledge base + custom **Styles** (trained on your samples) `(Projects/Styles from general product knowledge; $20 price verified)`. The $20 flat tier is now the industry standard. ([suprmind](https://suprmind.ai/hub/chatgpt/features/), [mywritingtwin](https://www.mywritingtwin.com/blog/chatgpt-projects-setup-guide), [intuitionlabs](https://intuitionlabs.ai/articles/claude-pricing-plans-api-costs), [aipricing.guru](https://www.aipricing.guru/compare/chatgpt-plus-vs-claude-pro/))

| Capability | ChatGPT/Claude raw | wmb-pub | Verdict |
|---|---|---|---|
| Direct frontier model, flat $20, effectively unlimited | Yes | No — BYOK per-token; and Coach is force-run on Sonnet regardless of choice | **DELIBERATELY-DIFFERENT** (+ wmb-pub has a model-honesty *defect*) |
| Persistent project workspace + files + memory | Projects + memory | Book context, WriterMemory, session briefs | **MATCH** (wmb-pub more structured for novels) |
| Custom instructions / style | 5,000-char instr; Claude Styles | Fingerprint/voice/calibration + system prompts | **MATCH** |
| Manuscript-aware editor (autosave, versions, findings) | **None** — chat window, copy/paste | Yes | **wmb-pub wins** |
| Series continuity graph | No (context window only) | Neo4j + vector memory | **wmb-pub wins** |
| Structured multi-agent writing workflows | No (manual prompting) | 14 agents / ~28 workflows | **wmb-pub wins** |
| Multimodal (image/voice/data) | Yes | No | **DELIBERATELY-DIFFERENT** |

**The one thing that keeps a writer on ChatGPT/Claude:** **The smartest model, directly, for a flat $20 — no markup, no per-token meter, no infra.** A writer comfortable pasting chapters into a Project gets frontier reasoning at a fixed price. wmb-pub's pitch ("we orchestrate that model *around* your book") only wins if the orchestration clearly beats copy-paste — and today it undercuts itself by secretly billing Claude Sonnet prices even when the user picked qwen.

---

## 8. Google Docs

**What it is + pricing.** The universal, free-tier word processor with best-in-class **real-time collaboration**, comments/suggesting mode, and version history — now with **Gemini** embedded ("Help me write," "Help me create" full-draft generation from Drive/Gmail context, "Match writing style/format"). Personal use free; Gemini-in-Docs requires **Workspace Business Standard $14/user/mo (annual)** or above (Starter $7 has Gmail-only AI); Plus $22. ([workspace.google.com/pricing](https://workspace.google.com/pricing), [ifeeltech](https://ifeeltech.com/blog/google-workspace-gemini-features-guide), [workspaceupdates](https://workspaceupdates.googleblog.com/2026/04/new-gemini-capabilities-in-google-docs-help-you-go-from-blank-page-to-brilliance.html))

| Capability | Google Docs | wmb-pub | Verdict |
|---|---|---|---|
| Real-time multi-author collaboration | Best-in-class | **No** | **REAL-GAP-TO-CLOSE** |
| Comments / suggesting mode / track changes | Yes | **No author annotations/TODOs** | **REAL-GAP-TO-CLOSE** |
| Free / universal / already-installed | Yes | No (BYOK + subscription-ish) | **DELIBERATELY-DIFFERENT** |
| Find & replace | Yes | **No** | **REAL-GAP-TO-CLOSE** |
| Zero lock-in / everyone can open it | Yes | Export exists but thin | **DELIBERATELY-DIFFERENT** |
| Autosave / version history | Yes | Yes (+ optimistic locking, crash buffer) | **MATCH** (wmb-pub arguably safer) |
| Fiction-craft AI (voice, continuity, findings) | Generic Gemini | Purpose-built | **wmb-pub wins** |
| Series/continuity graph | No | Yes | **wmb-pub wins** |

**The one thing that keeps a writer on Google Docs:** **Free, frictionless, real-time collaboration everyone already uses** — the moment a writer needs to share a chapter with a co-author, editor, or beta reader for live comments, Docs is the default. wmb-pub has no collaboration, no comments/suggesting, and no find-and-replace, so the editorial back-and-forth still happens in Docs.

---

# Synthesis 1 — Real gaps to close (founder backlog, ranked)

Ranked by segment-loss severity × how many incumbents expose the gap. Each REAL-GAP row across all tables, deduped and prioritized. Segment tags: **debut / pro / series / volume / hobbyist / stylist**.

| # | Gap | Exposed by | Loses segment(s) | Notes |
|---|---|---|---|---|
| 1 | **Chapter reorder is broken** (corkboard → 404; canvas → P2002 races) | Scrivener, Novelcrafter | **pro, series** | Live defect, not just a missing feature. Restructuring is a core act of serious authorship. Highest QA priority. |
| 2 | **No find & replace** (chapter or book-wide) | Scrivener, Google Docs, everyone | **pro, series** | Renaming a character across 20 chapters is impossible today. Table-stakes for revision. |
| 3 | **No publish-ready formatting/export** (Pandoc path thin, never smoke-tested) | Vellum, Atticus | **debut, pro** | Every self-publisher still buys a $147–$250 formatter. "Last mile" of the whole product. |
| 4 | **No managed / no-BYOK tier** (BYOK setup friction) | Sudowrite, NovelAI, ChatGPT/Claude | **hobbyist, debut** | Biggest addressable-market lever (flagged in memory as the biggest grade-lifter). BYOK is a moat for pros, a wall for beginners. |
| 5 | **No deterministic grammar/style engine + quantified craft reports** | ProWritingAid, Grammarly | **stylist, pro** | LLM findings vary run-to-run; no rules-based mechanics net; no pacing/dialogue/echo reports. |
| 6 | **No real-time collaboration / comments / suggesting mode** | Google Docs, Novelcrafter, Plottr Pro | **pro, series** | Co-author + editor + beta workflows leak to Docs. Tier-3, unshipped. |
| 7 | **No outline/synopsis layer** (no synopsis field; corkboard cards blank; plans buried in Library) | Scrivener corkboard, Plottr | **debut, pro** | Product-map calls it "the single biggest missing planning affordance." |
| 8 | **No plot-structure templates / beat sheets** | Plottr (30+), Sudowrite Story Engine | **debut, hobbyist** | Beginners need scaffolding to start; nothing here. |
| 9 | **No unlimited flat-rate generation option** | NovelAI, Novelcrafter (Featherless/Infermatic) | **volume** | Per-token BYOK meter creates cost anxiety for high-volume drafters. |
| 10 | **No local-model (Ollama) path** | Novelcrafter | **volume, pro (privacy)** | Free/private generation after subscription; wmb-pub is cloud-provider-only. |
| 11 | **No visual timeline / parallel plotlines** | Plottr | **series** | Multi-POV/non-linear structure has no spatial view. |
| 12 | **No native mobile/desktop, no true offline authoring** | Scrivener (iOS/offline), Vellum | **pro, volume** | Responsive web only; immersive mode even has a ~30s content-loss window. |
| 13 | **Scene-level management** (only `<hr>` breaks) + **author annotations/TODOs** | Scrivener, Docs | **pro** | Can't mark "fix this later" or manage scenes within chapters. |
| 14 | **In-editor entity mention-tracking not wired** (dead component) | Novelcrafter Codex | **series** | The graph exists; the in-editor surfacing doesn't. |
| 15 | **No proprietary fiction-tuned model** (prose quality capped by BYOK model) | Sudowrite Muse | **hobbyist, stylist** | Hardest/most-expensive to close; mitigate with better prompt craft, not a house model. |

> **QA-campaign note:** #1 and the model-identity dishonesty defect (Coach force-run on Sonnet regardless of the user's pick; discuss threads hardcoded to Haiku; AuthorshipTracker faking "100% human") are **live defects**, not feature gaps — they belong at the top of the defect queue because they actively mislead or break, whereas #6–#15 are absent features.

---

# Synthesis 2 — Where wmb-pub already wins (moats no incumbent matches)

| Moat | What it is | Who it beats | Why they can't match it |
|---|---|---|---|
| **Cross-book series continuity graph** | Neo4j character-network/timeline/location/plot-thread graph + ambient series panel + live continuity net (auto-scan, inline flags, mark-intentional) | **Sudowrite, NovelAI, Novelcrafter, Scrivener, ChatGPT/Claude, Docs** | Everyone else has *single-book* passive bibles (Codex/Story Bible/Lorebook) or just a context window. Nobody actively *scans* for continuity breaks across a series. Roadmap called this "weak everywhere — open moat." |
| **Voice-preserving, quote-anchored editorial loop that learns** | Findings anchored to verbatim quotes (fuzzy ≥0.8, dedup, grounding score), apply/dismiss/undo/**discuss**, feeding a WriterMemory that infers preferences from dismissals; prompts carry a style fingerprint | **Grammarly, ProWritingAid, ChatGPT/Claude, Sudowrite** | Grammarly/PWA give generic rule fixes; chatbots give one-shot rewrites; none *anchor* edits to your text, *learn* from your rejections, or preserve a captured voice fingerprint across sessions. |
| **Honest, transparent BYOK economics** | 5 providers, live-validated keys, exact per-model/per-key/per-book USD tracking with cost-drift + price-discrepancy detection | **Sudowrite (opaque credits), NovelAI (Anlas), Novelcrafter (partial)** | Credit/Anlas systems deliberately obscure cost. wmb-pub shows the real number and flags when its own price table drifts. (Caveat: undermined today by the Coach billing Claude prices under a qwen label — fix that and the moat is clean.) |
| **Production-grade data safety** | 2s-debounce autosave, optimistic locking + 409 conflict machinery, IndexedDB crash buffer, offline, version diff/restore | **Sudowrite, NovelAI, ChatGPT/Claude** | Web chatbots and most AI studios have no optimistic-locking/crash-buffer story; wmb-pub's autosave is genuinely the strongest-engineered part of the app. (Caveat: the *document* editor and immersive mode don't yet share it.) |
| **Purpose-built multi-agent novel workflow** | 14 agents / ~28 workflows (capture-style → bible → architecture → discuss/plan/write → dev/line/beta → revise → publishing-check) with structured status pipeline | **ChatGPT/Claude raw, Google Docs, Grammarly** | Raw LLMs require the writer to hand-orchestrate every step; wmb-pub encodes the whole novel-production pipeline as first-class workflows. |
| **Conversational findings + discuss threads** | Argue with an editorial note instead of blindly accept/reject (Tier 4.2) | **Grammarly, ProWritingAid, Sudowrite** | Competitors' suggestions are take-it-or-leave-it; wmb-pub lets the author push back and the note responds in context. |

**Net read for QA:** wmb-pub's moats are real and defensible on the **AI-editorial and series-continuity axes** — that's where it beats every incumbent. But it is **losing the boring, table-stakes manuscript-management fight** (reorder, find-and-replace, outline, formatting, collaboration) to 20-year-old tools like Scrivener and free tools like Google Docs, and it is **walled off from beginners** by BYOK. The moats keep a *serious, technical, series-writing pro* who's already invested; the gaps are why a *debut author or hobbyist* bounces in the first hour. Prioritize the live defects (reorder, model-identity honesty) first — they're both real bugs and competitive wounds.

---

## Sources
- Sudowrite: [builtwritten](https://www.builtwritten.com/blog/sudowrite-ai-2026) · [skywork](https://skywork.ai/blog/sudowrite-review-2025-story-engine-describe-pricing/) · [costbench](https://costbench.com/software/ai-writing-tools/sudowrite/) · [ucstrategies](https://ucstrategies.com/news/sudowrite-review-i-tested-the-22-month-ai-against-chatgpt-across-70000-words/)
- NovelAI: [docs.novelai.net/subscription](https://docs.novelai.net/en/subscription/) · [docs.novelai.net/text/models](https://docs.novelai.net/en/text/models/) · [aitoolsdevpro](https://aitoolsdevpro.com/ai-tools/novelai-guide/)
- Novelcrafter: [novelcrafter.com/pricing](https://www.novelcrafter.com/pricing) · [toolworthy](https://www.toolworthy.ai/tool/novelcrafter) · [dreamgen](https://dreamgen.com/blog/articles/novelcrafter-review)
- Scrivener/Plottr: [scrivener.software](https://scrivener.software/) · [propicked](https://propicked.com/ai-tools/scrivener/pricing) · [plottr.com/pricing](https://plottr.com/pricing/) · [reedsy Plottr](https://reedsy.com/blog/guide/book-writing-software/plottr-review/)
- Atticus/Vellum: [kindlepreneur](https://kindlepreneur.com/atticus-vs-vellum/) · [brighterapublishing](https://brighterapublishing.com/vellum-vs-atticus-which-book-formatting-software-is-worth-your-money-in-2025/)
- ProWritingAid/Grammarly: [manuscriptreport](https://manuscriptreport.com/blog/prowritingaid-vs-grammarly) · [zapier](https://zapier.com/blog/prowritingaid-vs-grammarly/) · [saaspricepulse](https://www.saaspricepulse.com/tools/prowritingaid)
- ChatGPT/Claude: [suprmind](https://suprmind.ai/hub/chatgpt/features/) · [mywritingtwin](https://www.mywritingtwin.com/blog/chatgpt-projects-setup-guide) · [intuitionlabs Claude pricing](https://intuitionlabs.ai/articles/claude-pricing-plans-api-costs) · [aipricing.guru](https://www.aipricing.guru/compare/chatgpt-plus-vs-claude-pro/)
- Google Docs/Workspace: [workspace.google.com/pricing](https://workspace.google.com/pricing) · [ifeeltech](https://ifeeltech.com/blog/google-workspace-gemini-features-guide) · [workspaceupdates](https://workspaceupdates.googleblog.com/2026/04/new-gemini-capabilities-in-google-docs-help-you-go-from-blank-page-to-brilliance.html)
- wmb-pub capabilities: `docs/mission/product-map.md`, `docs/mission/key-facts.md` (codebase-grounded, this repo)

*(unverified) items flagged inline: Vellum exact tier pricing (sources range $199.99–$299.99); Claude Projects/Styles feature details (product knowledge, price verified); whether wmb-pub encrypts prose at rest; NovelAI 2026 inflation-adjusted rates vs. listed $10/$15/$25.*
