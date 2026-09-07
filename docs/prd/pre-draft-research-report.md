# Pre-draft pipeline competitive brief — AI fiction/novel writing tools

Scope of the pre-draft phase: idea → synopsis → outline/structure → planning/chapter plan → research/worldbuilding → draft, and how each tool's AI/agents are wired through it.

---

## 1. Sudowrite

**Pre-draft pipeline:** idea → Story Engine (brief → beats) → Story Bible (persistent character/world context) → Brainstorm (expansion) → Outline/Scenes (beat-by-beat structure with per-beat drafting hook) → Describe/Rewrite polish → Write/Draft. The Story Bible is injected as persistent context into every generation.

### Stages/artifacts stored/generated
- **Story Engine → beats → prose:** Sudowrite's long-form generator takes a premise/genre/style/character "creative brief" and generates scene/chapter beats, then full prose following narrative arcs (Story Engine, now v3). Founder James Yu described collaborative novel-writing ("write an entire novel in just a few days") where scenes are processed "beat-by-beat." Source: [Gizmodo Story Engine launch](https://gizmodo.com/sudowrite-launch-novel-writing-ai-software-story-engine-1850450016) · [Features overview (docs)](https://docs.sudowrite.com/getting-started/dQph1snuwbfMWG9wRjsNug/features/dq7YUMNy5ZMvKUJiRAisyT)
- **Story Bible** — Sudowrite's structured repository for characters, world-building notes, plot summaries, and writing-style guidance; "Sudowrite references the Story Bible in every generation" for consistency. Sources: [Clarigital guide](https://www.clarigital.com/ai-atlas/specialist-tools/writing-content/sudowrite/) · [What is Story Bible (docs)](https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/what-is-story-bible/jmWepHcQdJetNrE991fjJC) · [Story Bible blog](https://sudowrite.com/blog/story-bible-template/)
- **Brainstorm** — outlining/idea agent that generates characters (names, backstory), worldbuilding, plot twists, dialogue, and alternative scene directions. Reedsy notes it saves selections into the editor but does **not** auto-integrate into the Story Bible. Source: [Brainstorm (docs)](https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/brainstorm/5xJUutV75BLU6u9LZndcDs) · [Reedsy review](https://reedsy.com/blog/guide/book-writing-software/sudowrite/)
- **Outline / Scenes (the beat sheet):** the Outline module breaks a concept into individual scene-beats and generates a draft from each beat; it feeds directly into scene-by-scene drafting. Source: [Outline (docs)](https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/outline/3owKyHXUm1bCdp41b2Npjk) · [How to Outline blog](https://sudowrite.com/blog/how-to-outline-a-novel/) · [Fix your outline with Beats blog](https://sudowrite.com/blog/your-outline-sucks-heres-how-to-use-sudowrite-beats-to-fix-it/)
- **Scenes & Draft** — the module where outlined scenes flow into drafting (the pre-draft → draft handoff). Source: [Scenes & Draft (docs)](https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/scenes--draft/49p5MTVxTKkVFEC5rVUzpY)
- **Describe** — inline prose polish that expands highlighted text with sensory "show, don't tell" detail (five senses/metaphors). Source: [Reedsy Describe](https://reedsy.com/blog/guide/book-writing-software/sudowrite/) · [Describe blog](https://sudowrite.com/blog/show-dont-tell-writing-describe-feature/)
- **Worldbuilding** — dedicated pre-draft module to build setting, factions, magic systems, etc. Source: [Worldbuilding (docs)](https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/worldbuilding/uc5NfWSz4x8Wm3S19LZeo8)
- **Knowledge base / Context / "story so far":** the Story Bible functions as a persistent context store injected into the context window for relevant generation requests, maintaining continuity. Source: [Clarigital Story Bible architecture](https://www.clarigital.com/ai-atlas/specialist-tools/writing-content/sudowrite/) · [Glossary (docs)](https://docs.sudowrite.com/getting-started/dQph1snuwbfMWG9wRjsNug/glossary/1Symu5y4wtu65nQVYHjhxa)

**Artifacts NOT present as explicit stored fields:** a dedicated titled "logline" / "high concept" field (idea is captured via the creative brief/prompt), and the synopsis is described as the foundation rather than a formal artifact (Sudowrite's emphasis is the Story Bible + Outline beats).

### AI/agent wiring
- Story Engine + Story Bible are wired so Bible context is injected per-generation to keep character/world details consistent. Chapter beats from Story Engine feed "Scenes & Draft" for per-beat drafting.
- The Brainstorm agent's outputs can be saved into the editor and reused, but Brainstorm does **not** automatically write back into the Story Bible (no full auto-feedback loop between brainstorm and the persistent bible). Source: [Reedsy](https://reedsy.com/blog/guide/book-writing-software/sudowrite/)
- No dedicated "continuity-checker" agent is documented; consistency relies on Story Bible context injection rather than a validation pass.

### Human-in-the-loop checkpoints
- Human populates the Story Bible before/while generating (characters, world, plot summaries); Sudowrite requires human-provided detail to avoid "bland" output.
- Human reviews/edits every generated beat and prose block ("always edit AI-generated prose heavily" — Sudowrite is a first-draft machine).
- Human chooses among alternative outputs from Brainstorm/Rewrite/Describe. Reedsy: Sudowrite "cannot be given free rein" — humans steer scene-by-scene.

[Back to top]

---

## 2. NovelCrafter

**Pre-draft pipeline:** Codex (structured knowledge base, injected into every AI prompt) → Summary/Synopsis (via Chat) → Outline (acts → chapters → scenes; templates for 3-Act / Save the Cat / Hero's Journey; "Create from Outline" scaffolds the book) → chapter summaries / subplots (via Chat) → scene beats → prose drafting in the Write/Manuscript, with the Plan section and story board for scene-level planning.

### Stages/artifacts stored/generated
- **Book hierarchy:** Book → Act → Chapter → Scene → Beat (each node carries its own summary that feeds the AI); beats are "the smallest units that make up each scene." Source: [Organizing in Novelcrafter](https://www.novelcrafter.com/help/getting-started/quick-start/organizing-in-novelcrafter) · [What are Beats (course)](https://www.novelcrafter.com/courses/beats-cookbook/what-are-beats)
- **Codex (the character/world/lore bible):** Novelcrafter's Codex is more than notes — codex entries are added to the AI's knowledge base so the AI can generate useful outputs and can be referenced in any prompt. Codex is typed (6 built-in types), has aliases/mentions the AI auto-detects, tracking, relations, details, and a Series Codex that carries entities across books. Source: [The Codex (docs)](https://www.novelcrafter.com/help/docs/codex/the-codex) · [Codex Types (docs)](https://www.novelcrafter.com/help/docs/codex/codex-types) · [Series Codex (docs)](https://www.novelcrafter.com/help/docs/codex/series-codex) · [Blog: Plotting a Story with AI](https://www.novelcrafter.com/blog/plotting-a-story-with-ai)
- **Summary/Synopsis (Step 1):** the summary/synopsis is the first planning artifact; generate it with the AI in Chat covering inciting incident, major twist, climactic moment. Source: [Plotting blog](https://www.novelcrafter.com/blog/plotting-a-story-with-ai)
- **Outline (Step 2):** outline = structure; individual acts, chapters, and scenes are mapped onto it. Generate via Chat conforming to an archetype (3-act, hero's journey, "3 acts with 5 chapters each"), or build manually (add acts → chapters → scenes). The **"Create from Outline"** button scaffolds all the acts and chapters at once (outline-to-plan handoff). Source: [Plotting blog](https://www.novelcrafter.com/blog/plotting-a-story-with-ai) · [Create from Outline (docs)](https://www.novelcrafter.com/help/docs/plan/create-from-outline)
- **Templates (pre-made outlines):** Novelcrafter ships 3 **Act Structure, Save the Cat, and Hero's Journey** templates; users can create their own templates as Codex entries and have the AI use them in Chat. Source: [Plotting blog](https://www.novelcrafter.com/blog/plotting-a-story-with-ai)
- **Plan section / story board / Matrix:** the Plan interface arranges the book as scenes; "Plan Views" include a story board and a spreadsheet-like Matrix to track "outlines, scene summaries, POV, subplots and more"; scene cards carry type/length/summary. Source: [Plan category (docs)](https://www.novelcrafter.com/help/categories/plan#section-docs) · [Planning with the Matrix](https://www.novelcrafter.com/help/docs/plan/planning-with-the-matrix) · [Plan Views](https://www.novelcrafter.com/help/docs/plan/plan-views)
- **Chapters & subplots (Steps 3–4):** generate/flesh out chapter summaries via Chat; make a Codex entry per subplot for reference when generating scene beats later. Source: [Plotting blog](https://www.novelcrafter.com/help/docs/plan/planning-with-the-matrix)
- **Scene beats → prose:** Novelcrafter stores scene-level "beats" (short plot-point/shorthand lists) under each scene that the AI expands into full prose. Source: [where scene/chapter/act/book summaries and beats go (docs/FAQ)](https://www.novelcrafter.com/help/faq/plan/where-do-i-put-my-scene-chapter-act-book-summary-what-about-my-beats) · [Beats vs continue writing (FAQ)](https://www.novelcrafter.com/help/faq/write/scene-beat-vs-continue-writing)
- **Extract feature:** converts unstructured text into the book structure. Source: [Extract (docs)](https://www.novelcrafter.com/help/docs/organization/the-extract-feature)

**Explicit artifacts stored:** synopsis (Book summary), Act summary, Chapter summary, Scene summary, beats, Outline, Codex bible. Note: Novelcrafter does **not** store a separate "logline" or "high concept" field — the Book summary is the top-level synopsis, and a premise/idea is typically kept as a Codex "Other" entry.

### AI/agent wiring
- **Codex injection:** the Codex is "your story's central reference hub… works automatically in the background"; its **six built-in types are character, location, object, lore, subplot, other**, and entries auto-inject into prompts via aliases/mentions so the AI writes consistently with the user's canon. Source: [Codex Types](https://www.novelcrafter.com/help/docs/codex/codex-types) · [Prompt Functions](https://www.novelcrafter.com/help/reference/prompts/prompt-functions) · [Codex context in prompting (FAQ)](https://www.novelcrafter.com/help/faq/ai-and-prompting/codex-context-in-prompting)
- **Story-so-far context** is materialized through **prompt functions** — `storySoFar`, `storyToCome`, `act.summary`, `chapter.summary` — which pull earlier scene/chapter summaries into each generation so the AI knows what already happened. Source: [Prompt Functions](https://www.novelcrafter.com/help/reference/prompts/prompt-functions) · [Prompt Examples](https://www.novelcrafter.com/help/reference/prompts/prompt-examples) · [Scene summaries & the writing loop (course)](https://www.novelcrafter.com/courses/ultimate-beginners-guide/scene-summaries-and-the-writing-loop)
- **Beats → prose:** beats are per-scene AI directions written with a forward slash (`/`) or pipe in Write; "The AI reads your beat alongside the context from your Codex and your existing prose. It then generates a new passage based on your instruction." Source: [What are Beats (course)](https://www.novelcrafter.com/courses/beats-cookbook/what-are-beats) · [Generating prose with AI (docs)](https://www.novelcrafter.com/help/docs/write/generating-prose)
- **AI Actions / prompts:** the drop-down AI command list. Default prompts include **Summarize Scene** (word-count options 80/120/300), **Expand** (add feelings/sensory details with an exact word-length target), **Rephrase**, **Shorten**, **Scene beats**, plus Chat prompts such as a "developmental editor" persona. Source: [Default prompts (docs)](https://www.novelcrafter.com/help/docs/prompts/default-prompts) · [New prompting system blog (May 2025)](https://www.novelcrafter.com/blog/new-prompting-system)
- **Chat as the planning agent:** a ChatGPT-style side panel that can access the whole manuscript/outline/codex; type a Codex entity name (a "mention") to add its entry to context; used to generate/brainstorm outlines and chapter beats. Source: [Chat (docs)](https://www.novelcrafter.com/help/docs/chat/the-chat-interface) · [Codex and chat (course)](https://www.novelcrafter.com/courses/ultimate-beginners-guide/codex-and-chat)
- **BYOK model support:** connects to OpenAI, Claude, Groq, ANS, LM Studio, Ollama, OpenRouter; user chooses model collections. Source: [AI Connections (docs)](https://www.novelcrafter.com/help/categories/ai-connections#section-docs)

### Human-in-the-loop checkpoints
- Human writes/approves the Book/Act/Chapter/Scene summaries and beats; the AI drafts prose from a beat the human sets, and the human reviews each generated scene. Source: [where summaries/beats go (docs)](https://www.novelcrafter.com/help/faq/plan/where-do-i-put-my-scene-chapter-act-book-summary-what-about-my-beats)
- "Create from Outline" scaffolds the structure, which the human then edits/reorders scene-by-scene. A "beat" is only drafted when the author invokes the AI for that scene (no unattended full-book generation). Source: [Create from Outline (docs)](https://www.novelcrafter.com/help/docs/plan/create-from-outline)

[Back to top]

---

## 3. Squibler

**Pre-draft pipeline:** idea prompt → AI Novel Writer first structured draft (Book Proposal + outline w/ chapter outlines + scene beats + opening prose) → "Check" review/refine → Generate Full-Length Book (single sequential run), with a persistent "Elements" panel (characters/settings/objects) the AI references for consistency.

### Stages/artifacts stored/generated
- **Idea capture / prompt:** describe the novel concept (genre, characters, plot) in a prompt box. Source: [AI Novel Writer](https://www.squibler.io/ai-novel-writer/)
- **Book Proposal step** (since ~Jan 2025): an explicit pre-draft artifact to refine the idea and "define their book's structure better before AI takes over" (customize chapters, characters, settings, themes). Source: [What's New / release notes](https://www.squibler.io/whats-new/)
- **Outline artifact:** first generation returns a structured draft with "chapter outlines, scene beats, and opening prose"; the AI Novel Generator "helps writers create a complete novel OR a structured outline from a single idea."  Source: [AI Book Writer](https://www.squibler.io/ai-book-writer/general-fiction/) · [AI Novel Generator](https://www.squibler.io/ai-novel-generator/)
- **Elements panel (worldbuilding/character store):** Elements = important characters, settings, objects (fiction) or concepts/facts (non-fiction); each has a text definition + optional AI-generated image + attribute boxes. Source: [Elements tutorial](https://www.squibler.io/knowledge-center/tutorials/getting-started-and-navigation/elements/)
- **Chapters/scenes dashboard:** word counts and section progress. Source: [Novel Writing Software](https://www.squibler.io/novel-writing-software/)

**Not found as explicit stored artifacts:** a dedicated logline / synopsis / high-concept field (the concept lives in the prompt + Book Proposal). No standalone "AI worldbuilding generator" landing page; worldbuilding is via the Elements panel.

### AI/agent wiring
- **Chat-driven flow:** "Create novels by chatting with AI to brainstorm, outline, and visualize your story" — Prompt → Generate → Check → Finish. Source: [AI Novel Writer](https://www.squibler.io/ai-novel-writer/)
- **Agentic Editor (April 2026):** AI chat + agentic commands that "create outlines, generate chapters, structure your book, and edit content"; command palette, version control. Source: [What's New](https://www.squibler.io/whats-new/)
- **Preset AI actions** replicate into the chat (Brainstorm, Outline, Draft, Expand, etc.). Source: [Outline Function](https://www.squibler.io/knowledge-center/tutorials/how-to-use-the-outline-function/)
- **Sequential full-book generation:** full-length book produced in one run (sequential internally for structure/coherence), not chapter-by-chapter. Source: [What's New](https://www.squibler.io/whats-new/)
- **Context from Elements:** "Squibler's AI will pull from how you describe your Elements as the AI creates text, images, and dialogue." Source: [Elements](https://www.squibler.io/knowledge-center/tutorials/getting-started-and-navigation/elements/)

### Human-in-the-loop checkpoints
- **"Check" step:** "Review the generated output and refine your prompt" between the first structured draft and Generate Full-Length Book. Source: [AI Novel Writer](https://www.squibler.io/ai-novel-writer/)
- **Book Proposal control** lets the user define chapter/character/setting/theme before the full book is generated. Source: [What's New](https://www.squibler.io/whats-new/)
- **Per-suggestion accept/reject** during drafting. Source: [Novel Writing Software](https://www.squibler.io/novel-writing-software/)
- No per-chapter forced sign-off documented — the full book generates in one action, edited afterward.

[Back to top]

---

## 4. Plottr

**Pre-draft pipeline:** Timeline (chapters × plotlines × scene cards) → auto-generated Outline → (Outline V2 Plan view to sequence beats/scenes) → manual export to Word/Scrivener. **No AI** — Plottr announced AI in 2024 but pulled it from the 2026 roadmap ("AI is NOT coming to Plottr").

### Stages/artifacts stored/generated
- **Timeline = the hub:** chapters (horizontal headings), plotlines (vertical lanes: main plot/subplots/arcs), scene cards; chapter headings renameable to "Scene"/"Beat"/"Act"; unlimited. Source: [Timeline Overview](https://docs.plottr.com/article/54-timeline-overview) · [Chapters/Plotlines](https://docs.plottr.com/article/55-timeline-plotlines)
- **Outline auto-generated from Timeline:** "The Outline is automatically generated in Plottr using the content and structure of your Timeline." Source: [Plottr Overview](https://docs.plottr.com/article/8-plottr-overview) · [Outline Overview](https://docs.plottr.com/article/68-outline-overview)
- **Outline V2 (since v2024.10.9):** adds a Plan view (Kanban to sequence/rearrange beats & scenes within/among chapters) and Fulltext view. Source: [Outline Books](https://plottr.com/outline-books/)
- **Characters:** cards with custom attributes from Character Templates (Bio, GMC, Snowflake, Enneagram, MBTI...). Source: [Characters Templates](https://docs.plottr.com/article/85-characters-templates)
- **Places (locations/world):** tracked as Places; **no dedicated world module**; "You cannot create Templates for Places." Source: [Places Overview](https://docs.plottr.com/article/88-places-overview)
- **Notes store worldbuilding/lore/research:** linkable to books/characters/places/tags. Source: [Notes Overview](https://docs.plottr.com/article/73-notes-overview)
- **Series bible / Project tab:** multiple books per project; Series View maps plotlines across the series. Source: [Series Bible hacks](https://plottr.com/series-bible-hacks/)
- **Templates:** Custom Timeline Templates [doc](https://docs.plottr.com/article/149-custom-timeline-templates); Premium "Roadmap" Packs (full .pltr projects) for Romance/Mystery/Thriller/Fantasy/Sci-Fi/Memoir/YA beat sheets [doc](https://docs.plottr.com/article/147-using-premium-project-templates) · [Mystery pack](https://plottr.com/mystery-roadmap-pack/)

### AI/agent wiring
- **Announced Mar 2024** brainstorming AI (generate character/scene/place ideas, fill character sheet, summarize book — not drafting). Source: [Plottr's AI future](https://plottr.com/plottrs-ai-future/)
- **May 2024 workflow doc:** AI off by default, paid add-on, calls "ChatGPT (or similar)" via API after explicit "Generate" confirm; "AI-assisted" positioning under KDP. Source: [AI in Plottr workflow](https://plottr.com/ai-in-plottr-workflow/)
- **Current status (Jan 2026, upd. May 2026): "AI is NOT coming to Plottr"** — removed from roadmap; keeping it "human-centered." Source: [Plottr in 2026](https://plottr.com/plottr-in-2026/)
- Therefore **no AI outline generation, no beat suggestions, no AI drafting, no AI handoff** as shipped.

### Human-in-the-loop checkpoints
- No AI output to approve, so checkpointing is fully manual: author builds Timeline/outline, then reviews/edits the auto-generated Outline and **exports only when they choose**. Source: [Outline Overview](https://docs.plottr.com/article/68-outline-overview)
- **Draft handoff = manual export** to Microsoft Word or Scrivener (pick Title Page / Outline / Characters / Places / Notes); no live 2-way sync. Source: [Exporting](https://docs.plottr.com/article/66-exporting)

[Back to top]

---

## 5. Campfire (Blaze → Write)

**Pre-draft pipeline:** Projects → Elements (characters, locations, chapters, etc. with customizable panels) → wiki worldbuilding modules (Encyclopedia lore, magic/species/cultures/etc.) → Timeline (plotlines, chronological event cards, story-structure templates incl. Save the Cat) → Manuscript word processor with Index Card chapter planning → export. **No generative AI** — manual pre-draft pipeline.

### Stages/artifacts stored/generated
- **Campfire Blaze was shut down / renamed:** "Campfire Blaze was a browser application... Since we launched this website, Blaze has been shut down, and everything people created on it transferred here." Today marketed as **Campfire Write** by Campfire Technology LLC. Source: [Campfire FAQ](https://campfirewriting.com/faq) · [Reedsy Campfire Write review](https://reedsy.com/blog/guide/book-writing-software/campfire-write-review/)
- **Data model:** Projects → Elements (characters, locations, chapters) → highly customizable panels (text fields, charts, images). Source: [Campfire FAQ](https://campfirewriting.com/faq)
- **Worldbuilding modules / entities:** Characters, Locations, Maps, Systems, Cultures, Languages, Religions, Philosophies, Magic, Items, Species; plus Manuscript, Research, Timeline, Arcs, Relationships, Encyclopedia (wiki-style lore articles). "Eighteen Modules." Source: [Worldbuilding tools](https://www.campfirewriting.com/worldbuilding-tools) · [Reedsy](https://reedsy.com/blog/guide/book-writing-software/campfire-write-review/)
- **Encyclopedia = wiki-style lore:** "Write character backstories, detail world lore, create wiki-style articles, organize family trees." Source: [Apps](https://www.campfirewriting.com/apps)
- **Timeline & plotlines:** Timeline module = chronological event cards composing plotlines, runnable in parallel; includes free story-structure templates: 3-Act, 7-Point, 27-Chapter, Fichtean Curve, Heroine's Journey, Hero's Journey, Romancing the Beat, **Save the Cat! 15-beat**, Story Circle, Story Grid. Source: [Story Planner](https://www.campfirewriting.com/story-planner) · [Timeline Maker](https://campfirewriting.com/timeline-maker)
- **Arcs module** (character change over time); **Calendar module** (fictional calendars linkable to timeline); **Maps** (upload image, pins/zones/scale/compass; Campfire does NOT generate the map image). Source: [Reedsy](https://reedsy.com/blog/guide/book-writing-software/campfire-write-review/)
- **Manuscript module (the writing app):** word processor with **Index Card View** for creating/editing/rearranging chapters and tracking word-count goals + progress statuses; import DOCX/EPUB splits into chapters; export EPUB/PDF. Source: [Word Processor](https://www.campfirewriting.com/word-processor) · [Story Planner](https://www.campfirewriting.com/story-planner)

**Not found in official docs:** dedicated logline/synopsis/beat-sheet/treatment records; a distinct "scene" artifact (chapters contain prose; scenes are timeline-timed events). No AI feature.

### AI/agent wiring
- **None.** No generative-AI drafting, autocomplete, or AI writing assistant is documented. Reedsy: modules serve as "creative brainstorming sheets" prompting manual filling (e.g., character questionnaire) — **no AI generation or outline-to-draft handoff**. Source: [Reedsy Campfire Write review](https://reedsy.com/blog/guide/book-writing-software/campfire-write-review/)
- Note: do not conflate with the unrelated AI-native "Campfire" (campfire.ai) ERP company.

### Human-in-the-loop checkpoints
- Author manually creates/fills element records and customizes panels; no auto-generation step. Source: [Campfire FAQ](https://campfirewriting.com/faq)
- Draft handoff is author-driven: write in the Manuscript module, consult Notes sidebar, link tags to Characters/Locations while writing. Source: [Word Processor](https://www.campfirewriting.com/word-processor)
- Manual progress checkpoints: word-count goals, stats, progress statuses, version history. Source: [Story Planner](https://www.campfirewriting.com/story-planner)

**Caveat:** campfirewriting.com help/learn article bodies are JS-rendered and were not retrievable by fetch; artifact-level details rest on official marketing pages + the independent Reedsy review (updated Jun 2026).

[Back to top]

---

## 6. Scrivener (Literature & Latte)

**Pre-draft pipeline:** Binder documents (Manuscript + Research + Trash roots) → themed chapter/scene folders + Character/Setting "sheets" (typed templates = character/world bible) → Corkboard index cards + Outliner rows (20+ columns, status, word count) → author writes → Compile to print/ebook. **No AI at all** (explicitly).

### Stages/artifacts stored/generated
- **Binder hierarchy (Draft/Manuscript, Front Matter, Back Matter, Research, Trash):** three un-deletable root folders — Draft (aka "Manuscript"), Research, Trash. Novel templates add Characters, Places, Front Matter. Draft accepts only text; Front/Back Matter sit apart for compile. Source: [Three Root Folders (KB)](https://scrivener.tenderapp.com/help/kb/features-and-usage/the-three-root-folders)
- **Corkboard (index cards) + Outliner:** every section has a virtual index card (synopsis); moving cards reorders the manuscript. Outliner supports 20+ columns (labels, status, keywords, word count, synopses, icons, numbers). Source: [Corkboard blog](https://www.literatureandlatte.com/blog/organize-your-scrivener-project-with-the-corkboard) · [Outliner blog](https://www.literatureandlatte.com/blog/plan-your-project-with-scriveners-outliner)
- **Character/world "bible" via typed sheets:** Characters folder with pre-formatted **Character Sketch** docs; templates folder holds Character and Setting sheets; any doc in Templates folder can be reused (e.g., "Character Interview"); custom metadata fields supported. Source: [Character blog](https://www.literatureandlatte.com/blog/how-to-manage-your-characters-in-scrivener) · [Project/Document Templates (KB)](https://scrivener.tenderapp.com/help/kb/features-and-usage/project-and-document-templates)
- **Research folder:** holds PDFs, images, audio/video, zip files, web-page snapshots; split-editor viewing; **not compiled** into the manuscript. Source: [Research folder blog](https://www.literatureandlatte.com/blog/use-scriveners-research-folder-to-store-information-about-your-project)
- **Templates/sample projects:** ships Novel, Novel (Parts), Documentary Script, Poem, Recipe Collection, Blank, etc. Save-the-Cat / 5-Act / Snowflake exist only as third-party imports. Source: [Templates (KB)](https://scrivener.tenderapp.com/help/kb/features-and-usage/project-and-document-templates)
- **Compile (draft → manuscript handoff):** stitches all texts into PDF/.docx/RTF/Final Draft/plain text/ePub/Kindle, with section layouts and front/back matter. Source: [Compile blog](https://www.literatureandlatte.com/blog/how-to-compile-your-scrivener-project-for-print-pdf-or-microsoft-word)
- **Targets/Status & chapter planning:** per-manuscript and per-section word targets + Writing History; manual Status labels (First Draft/Revised/Done). Source: [Scrivener overview](https://www.literatureandlatte.com/scrivener)

### AI/agent wiring
- **None — confirmed explicitly:** "Scrivener itself contains no artificial intelligence (AI)." Any AI prompts seen on macOS are Apple Intelligence (hosted by macOS), not Scrivener. Only an offline rule-based **Name Generator** exists (not ML). Sources: [Does Scrivener use AI? (KB)](https://scrivener.tenderapp.com/help/kb/general/does-scrivener-use-ai) · [Scrivener and AI blog](https://www.literatureandlatte.com/blog/scrivener-and-ai-why-do-i-see-ai-prompts-in-my-scrivener-projects-on-mac)
- No API/plugin/agent surface documented in official sources; AI-assisted composition must happen outside Scrivener and be pasted/imported.

  Source: [Character blog Name Generator](https://www.literatureandlatte.com/blog/how-to-manage-your-characters-in-scrivener)

### Human-in-the-loop checkpoints
- Every step (idea capture and drag-reordering, synopsis typing, plan review word-counts/status, research review, Compile) is a manual author action with no autogeneration. Compile is an explicit gate (choose scope/folder inclusion/target format). Source: [Compile blog](https://www.literatureandlatte.com/blog/how-to-compile-your-scrivener-project-for-print-pdf-or-microsoft-word)

Note: no built-in "beat sheet"/"chapter plan" feature beyond the novel folder structure; Save-the-Cat beat sheets exist only as third-party user templates.

[Back to top]

---

## 7. Plot-structure frameworks in novel software / AI outline generators

Canonical structures and which of the surveyed tools and broader AI outline generators ship them. ✓ = confirmed implemented; ✗ / "not confirmed" = no primary source found.

### Save the Cat! Beat Sheet (Blake Snyder, 15 beats)
**Canonical:** Opening Image, Theme Stated, Set-up, Catalyst, Debate, Break Into Two, B Story, Fun and Games, Midpoint, Bad Guys Close In, All Is Lost, Dark Night of the Soul, Break Into Three, Finale, Final Image. Source: [savethecat.com](https://savethecat.com) · [No Film School explainer](https://nofilmschool.com/save-the-cat-beat-sheet)
 **Implementation in the surveyed tools:**
- **Campfire ✓** — ships the "STC Story Beat Sheet" (15 beats) as a Timeline plotting template. [Campfire Story Planner](https://campfirewriting.com/story-planner)
- **Novelcrafter ✓ (outline template)** — ships a **Save the Cat** outline template (pre-made outline used to scaffold acts/chapters). Source: [Plotting a Story with AI](https://www.novelcrafter.com/blog/plotting-a-story-with-ai). Note: Novelcrafter's *per-scene beats* are free-form plot-point instructions, not a named framework library.
- **Plottr — not confirmed** as shipping a template explicitly named "Save the Cat" (its Premium Roadmap Packs cover Romance/Mystery/Thriller/Fantasy/Sci-Fi/Memoir/YA). Source: [Premium Templates doc](https://docs.plottr.com/article/147-using-premium-project-templates)
- **Sudowrite — beats library exists but named Save-the-Cat methods not confirmed** from primary sources (docs/blogs truncated; there is a "using beat sheets with Sudowrite" blog). Source: [Using beat sheets with Sudowrite](https://sudowrite.com/blog/using-beat-sheets-with-sudowrite/)
**Specialist software (✓ confirmed):** Save the Cat's own **Story Suite** and official **Save the Cat! app** (iOS/macOS) support BS2 for **screenplays, novels, and TV** with "The Board," sequences, and novel-by-chapter structuring — an official Save-the-Cat novel outlining product. The novel application of BS2 is *Save the Cat! Writes a Novel* (Jessica Brody). Sources: [Save the Cat! Story Suite for novels](https://savethecat.com/story-suite-for-novel-writing) · [Save the Cat! app (App Store)](https://apps.apple.com/mx/app/save-the-cat/id1495073895) · [Save the Cat novel starter kit (Brody)](http://www.jessicabrody.com/wp-content/uploads/2020/01/Save_the_Cat_Writes_a_Novel_Starter_Kit_v6.pdf)

### Hero's Journey (Joseph Campbell / Christopher Vogler, 12 stages)
**Canonical 12 stages (Vogler):** Ordinary World → Call to Adventure → Refusal of the Call → Meeting the Mentor → Crossing the First Threshold → Tests, Allies & Enemies → Approach to the Inmost Cave → Ordeal → Reward → The Road Back → Resurrection → Return with the Elixir. Sources: *The Writer's Journey* (Vogler) · [Final Draft — the Hero's Journey Ordinary World](https://www.finaldraft.com/blog/3-reasons-you-need-to-show-your-protagonists-ordinary-world) · [Hero's Journey paradigm, ibiblio](http://www.ibiblio.org/cdeemer/wright/journey.html)
 **Implementation:**
- **Campfire ✓** — "Hero's Journey" and "Heroine's Journey" (10-step) templates in the Timeline module. [Campfire Story Planner](https://campfirewriting.com/story-planner)
- **Novelcrafter ✓ (outline template)** — Hero's Journey outline template. [Plotting blog](https://www.novelcrafter.com/blog/plotting-a-story-with-ai)
- Third-party tools ✓: **Storyflow** ships a Hero's Journey 12-stage template (with AI reading the board); **ScreenWeaver** Story Map labels blocks as Hero's Journey stages. Source: [Storyflow beat-sheet tools](https://storyflow.so/blog/best-beat-sheet-tools-2026) · [ScreenWeaver — Save the Cat vs Hero's Journey](https://www.screenweaver.ai/blog/save-the-cat-vs-heros-journey)

### Three-Act Structure (Syd Field)
**Canonical (Syd Field, *Screenplay*, 1979):** Setup → Confrontation → Resolution, with an inciting incident/catalyst in Act I and a first plot point closing Act I; the climax answers the dramatic question in Act III. Source: [Wikipedia — Three-act structure](https://en.wikipedia.org/wiki/Three_act_structure)
 **Implementation:** Campfire ships a "3 Act Structure" template ✓; Novelcrafter ships "3 Act Structure" ✓ (both cited above). Most AI outline generators use three-act as the implicit default act breakdown.

### 3-Act / 8-Sequence Method
**Canonical (Frank Daniel's "8-sequence method," popularized by Gulino and Mackendrick):** the story is divided into **8 sequences of ~10–15 minutes**, each a self-contained "mini-movie" with its own goal and turning point; **Act I = sequences 1–2, Act II = sequences 3–6, Act III = sequences 7–8**. Sources: [Wikipedia — sequence approach](https://en.wikipedia.org/wiki/Screenwriting) · *Screenwriting: The Sequence Approach* (Gulino) · *On Film-making* (Mackendrick)
 **Implementation:** **No novel-writing/AI outline tool surveyed was confirmed to expose an explicit 8-Sequence template** — it remains a screenwriting pedagogy rather than a shipped novel-software feature. "Not confirmed."

### Cross-tool summary of structure implementation
| Structure | Campfire | NovelCrafter | Plottr | Sudowrite |
|---|---|---|---|---|
| Save the Cat (15-beat) | ✓ template | ✓ template | not confirmed | not confirmed |
| Hero's Journey | ✓ (H. + Heroine's J.) | ✓ template | (roadmap packs) | not confirmed |
| Three-Act | ✓ template | ✓ template | timeline templates | (implicit) |
| 8-Sequence | ✗ | ✗ | ✗ | ✗ |

Note on what AI outline tools actually do: most AI outline generators (Sudowrite Outline, NovelCrafter, Campfire templates) output **beats** (scene-step plot points) rather than a strictly labeled canonical beat-sheet; structural labels (Save the Cat / Hero's Journey / Three-Act) are most explicit in NovelCrafter and Campfire's named templates and in dedicated planning apps (Save the Cat software, Storyflow, ScreenWeaver).

---

## Cross-tool synthesis

### Common stages across all tools (the de-facto pre-draft pipeline)
1. **Idea / premise capture** — prompt (Squibler), creative brief (Sudowrite Story Engine), project premise (Plottr), Codex "Other"/premise entry (NovelCrafter), Story Bible (Sudowrite).
2. **Synopsis / summary** — Book summary (NovelCrafter), Story Engine brief, Squibler prompt; **no tool has a distinct "logline/high concept" field** except as part of the idea/premise text.
3. **Outline + structure scaffolding** — Sudowrite Outline (beats → scenes), NovelCrafter Outline + "Create from Outline", Squibler outline artifact, Campfire Timeline templates, Plottr Timeline→auto-Outline, Scrivener synopsis-outliner.
4. **Beat sheet / plot points** — Sudowrite beats, NovelCrafter scene beats, Campfire Save the Cat/plot templates, Plottr scene cards, Squibler "scene beats."
5. **Chapter / scene planning** — Card/scene-based: NovelCrafter scene cards + Matrix, Sudowrite Scenes & Draft, Plottr Timeline/Plan view, Campfire Manuscript Index Cards, Scrivener outliner + word-count columns, Squibler chapter dashboard.
6. **Character/world bible** — Sudowrite Story Bible, NovelCrafter Codex, Squibler Elements, Campfire element sheets, Plottr character/notes/places, Scrivener Character/Setting sheets.
7. **Draft handoff** — Sudowrite Draft, NovelCrafter per-beat prose, Squibler Generate Full-Length Book, Campfire Manuscript, Scrivener compile (manual), Plottr export (manual).

### Common gaps / differentiators
1. **AI outline→draft handoff depth varies sharply.** Sudowrite, NovelCrafter, and Squibler close the loop (AI beats → AI prose); Campfire, Plottr, and Scrivener are manual organizers with **no AI-generated draft** (Plottr and Campfire explicitly; Scrivener has no AI at all). This splits the market into **generative pre-draft** (Sudowrite, NovelCrafter, Squibler) vs **planning/workbench** (Plottr, Campfire, Scrivener).
2. **Continuity/consistency checking is mostly "context injection," not validation.** Sudowrite (Story Bible injected per-generation), NovelCrafter (Codex auto-injected), Squibler (Elements pulled) all **prevent** inconsistency by feeding canon to the AI; **none ships a dedicated "continuity checker" that audits the finished draft against the bible.** Campfire surfaces inconsistencies only through its visual timeline/arcs, not via an AI.
3. **No explicit "lock a beat/plot point" gate is shipped** in any surveyed tool — the common human-in-the-loop pattern is *approve outline, then approve each beat/scene as drafted* (NovelCrafter, Sudowrite) or a single *checkpoint before full generation* (Squibler).
4. **Missing artifacts:** logline/high-concept and scene/treatment are not first-class in most tools; synopsis exists as a summary field (NovelCrafter) or in the prompt/brief (Sudowrite/Squibler).
5. **Named story structures** (Save the Cat, Hero's Journey, Three-Act) are concentrated in NovelCrafter, Campfire, and Plottr templates; Sudowrite's beats library is more generic.

---

*Back to top links omitted for brevity. All facts verified against official docs/help, official blog posts/press, and the cited reliable reviews (Reedsy, Clarigital, Gizmodo) — see per-tool citations above.*