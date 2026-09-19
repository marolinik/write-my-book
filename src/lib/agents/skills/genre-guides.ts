/**
 * Genre-Specific Writing Guides — preinstalled skills for agents.
 * Injected into agent prompts based on book.genre to give every agent
 * genre-aware craft knowledge. Works with ALL models.
 */

export interface GenreGuide {
  genre: string;
  aliases: string[];
  conventions: string;
  pacing: string;
  characterArcs: string;
  readerExpectations: string;
  commonPitfalls: string;
  /** Beats / structure specific to this genre */
  structureNotes: string;
  /** Style notes for ghostwriter voice matching */
  proseStyle: string;
}

export const GENRE_GUIDES: GenreGuide[] = [
  {
    genre: "romance",
    aliases: ["romance", "love story", "romantic fiction", "contemporary romance", "romantic suspense", "romantika"],
    conventions: `- The central love story MUST drive the plot — it's not a subplot
- Emotionally satisfying ending required (HEA = Happily Ever After, or HFN = Happy For Now)
- Two POVs are standard (hero and heroine); some subgenres use single POV
- Meet-cute or inciting romantic event in Act 1
- Internal conflict (emotional wounds) matters more than external conflict
- Black moment / all-is-lost moment is mandatory before resolution
- Heat levels: Sweet (closed door) → Warm (fade to black) → Steamy (explicit) → Erotic
- Tropes are features, not bugs: enemies-to-lovers, fake dating, forced proximity, second chance, etc.`,
    pacing: `- Act 1 (25%): Meet + attraction + initial conflict. Hook readers with chemistry.
- Act 2a (25%): Growing closer, fun & games, developing feelings despite obstacles.
- Midpoint: A turning point that deepens commitment or reveals vulnerability.
- Act 2b (25%): Complications, rising stakes, external threats to the relationship.
- Black Moment (75-80%): The relationship seems impossible. Maximum emotional pain.
- Act 3 (20%): Grand gesture, reconciliation, HEA/HFN.
- Alternating tension: emotional intimacy scenes → conflict/separation → reunion → deeper intimacy`,
    characterArcs: `- Both leads need clear emotional wounds from their backstory
- The relationship heals both characters' wounds — they're better together
- Character growth should be BECAUSE of the relationship, not despite it
- Secondary characters (best friend, family) serve as mirrors and catalysts
- The antagonist can be external (villain, ex) or internal (fear, trauma)
- Avoid the "Big Misunderstanding" trope unless handled with sophistication — readers hate it when a 5-minute conversation would solve everything`,
    readerExpectations: `- CHEMISTRY from the first meeting — readers must feel the spark
- Emotional vulnerability — readers want to feel the characters' hearts
- Banter and tension in every interaction between the leads
- The promise of the HEA — readers need to trust it's coming even when things look bleak
- Sensory detail in intimate scenes (emotional and physical)
- Internal monologue showing attraction, confusion, fear of falling`,
    commonPitfalls: `- Insta-love without earning the emotional connection
- Hero/heroine who is mean or cruel beyond redemption (redemption requires vulnerability)
- Love interest who is passive or has no agency
- External conflict replacing internal emotional journey
- Black moment that feels contrived or easily solvable
- Sex scenes that don't advance the emotional relationship
- Forgetting the secondary romance arc (if applicable)`,
    structureNotes: `Romancing the Beat (Gwen Hayes):
1. Setup (ordinary world of BOTH leads)
2. Meet / Inciting Event
3. No Way (initial rejection/obstacle)
4. Adhesion (forced together, growing attraction)
5. Midpoint: Moment of Truth / Vulnerability
6. Retreat (one or both pull back)
7. All Is Lost (black moment)
8. Grand Gesture / Sacrifice
9. HEA / HFN`,
    proseStyle: `- Deep POV is standard — let readers FEEL the attraction physically
- Sensory language: heartbeat, breath, warmth, tingling, electricity
- Dialogue should crackle with subtext — what's NOT said matters
- Internal monologue during romantic moments is expected and welcome
- Pacing varies by heat level: sweet romance is more dialogue-driven; steamy romance lingers on physical sensation
- Avoid clinical language in intimate scenes; use the character's vocabulary
- Humor is a huge asset — readers love witty banter between romantic leads`,
  },
  {
    genre: "thriller",
    aliases: ["thriller", "suspense", "mystery", "crime", "detective", "noir", "triler", "krimić"],
    conventions: `- The central question drives everything: "Who did it?" or "Will they survive?"
- Ticking clock / escalating stakes are mandatory
- Red herrings and misdirection are expected and welcome
- Information control: the reader should know just enough to be hooked but not enough to solve it
- Twists should be surprising but fair — clues must be planted earlier
- The antagonist should be formidable and smart, not stupid
- Multiple suspect/theory paths keep readers guessing
- Resolution must be satisfying — no deus ex machina`,
    pacing: `- Start with a hook: murder, threat, mysterious event — within the first chapter
- Short chapters (2,000-3,000 words) are genre standard
- Chapter endings MUST have hooks — cliffhangers, revelations, or new questions
- Alternating POV between protagonist and antagonist builds tension
- Increasing pace: chapters get shorter as tension builds toward climax
- "Breathe" chapters between high-tension sequences (investigation, personal moments)
- The 75% mark should have a major twist that reframes everything`,
    characterArcs: `- Protagonist needs a personal stake beyond professional duty
- Flawed heroes are expected — addiction, broken relationships, dark past
- The investigation changes the investigator — they learn something about themselves
- Antagonist needs a compelling motive that makes twisted sense
- Supporting cast should include at least one character who isn't what they seem`,
    readerExpectations: `- Page-turning urgency — readers should be unable to stop
- Fair play: clues planted for the attentive reader
- Escalating danger and stakes
- A satisfying twist they didn't see coming but should have
- Justice or resolution (not necessarily happy)
- Procedural accuracy (readers will check your facts)`,
    commonPitfalls: `- The "stupid protagonist" who ignores obvious danger
- Coincidence-driven plot (too convenient discoveries)
- Villain monologuing their plan
- Predictable twists (the obviously suspicious character IS the villain)
- Forgetting to plant clues for the resolution
- Pacing collapse in the middle (investigation becomes repetitive)`,
    structureNotes: `1. Opening Hook (inciting crime/threat)
2. Investigation begins — protagonist enters the case
3. First false lead / red herring
4. Midpoint revelation — stakes escalate dramatically
5. Protagonist in danger / personal cost
6. Second false lead — everything they thought was wrong
7. Dark night of the soul — seems unsolvable
8. Final clue / breakthrough
9. Climactic confrontation
10. Resolution and aftermath`,
    proseStyle: `- Lean, propulsive prose — no purple passages during action
- Short sentences during tension; longer during investigation/reflection
- Specific procedural details build credibility
- Unreliable narration can be powerful if handled with skill
- Minimize internal monologue during action — use it between set pieces
- Dialogue should contain hidden information and subtext
- Environmental details should feel like clues, even when they're not`,
  },
  {
    genre: "fantasy",
    aliases: ["fantasy", "epic fantasy", "urban fantasy", "dark fantasy", "high fantasy", "sword and sorcery", "fantazija"],
    conventions: `- Worldbuilding is the backbone — magic systems, cultures, histories must feel real
- Rules of magic must be consistent (Sanderson's Laws: well-defined magic → satisfying resolution)
- The stakes should escalate from personal to world-level
- Prophecies, chosen ones, and quests are classic but can be subverted
- Maps and glossaries are expected in epic fantasy
- Multiple POVs are common in epic; single POV in urban/YA fantasy
- The world should feel lived-in — economics, politics, religion, food, daily life`,
    pacing: `- Epic fantasy: slower burn, 100K+ words, extended worldbuilding in Act 1
- Urban fantasy: faster pace, 80-100K words, modern setting reduces worldbuilding load
- Dark fantasy: atmospheric, dread-building pace with horror elements
- Action sequences should use the magic system creatively
- Political intrigue sections alternate with adventure/quest sections
- The "threshold crossing" (leaving the ordinary world) should happen by 15-20%`,
    characterArcs: `- The hero's journey is deeply embedded in fantasy — departure, initiation, return
- Mentor figures (and their death/departure) are structural pillars
- Power progression: characters should grow in ability AND wisdom
- Flawed heroes with clear moral dilemmas resonate more than pure good vs. evil
- Ensemble casts need distinct voices, skills, and internal conflicts
- Antagonists in the best fantasy have sympathetic motivations`,
    readerExpectations: `- A world they want to LIVE in (or visit, at least)
- Magic that follows consistent rules and creates interesting problems
- Epic scope that still cares about individual characters
- Payoffs for setups planted 100+ pages earlier
- Satisfying battles/confrontations that use established powers creatively
- Cultural depth — food, customs, languages, art, religion`,
    commonPitfalls: `- Infodumping worldbuilding in the first 50 pages
- Magic that solves problems too easily (no cost, no limits)
- Tolkien-cloning (generic medieval Europe with serial numbers filed off)
- The "chosen one" who has no agency — prophecy does all the work
- Neglecting the emotional story in favor of worldbuilding
- Power creep without consequences or costs
- Forgetting that your world's non-human cultures need to feel genuinely alien`,
    structureNotes: `Classic fantasy structure:
1. Ordinary World (establish the character before the adventure)
2. Call to Adventure (inciting event/discovery)
3. Refusal / Reluctance
4. Crossing the Threshold (entering the magical world)
5. Tests, Allies, Enemies (Act 2 — training, quests, growing power)
6. Approach to the Innermost Cave (midpoint escalation)
7. Ordeal (major setback, mentor loss, betrayal)
8. Reward (gaining the key to the climax)
9. The Road Back (Act 3 — racing toward confrontation)
10. Resurrection / Climax (final battle using everything learned)
11. Return with the Elixir (resolution, new status quo)`,
    proseStyle: `- Rich, descriptive prose is expected — readers want to SEE this world
- But avoid Victorian-style exposition dumps — weave details into action
- Match prose register to the world: high fantasy → more formal; urban → contemporary
- Invented terms need context clues — don't require a glossary to understand the story
- Battle scenes need choreography — readers should be able to map the space
- Magic descriptions should be sensory and visceral, not abstract
- Internal monologue should reflect the character's cultural worldview`,
  },
  {
    genre: "literary",
    // "fiction", "novel" and "drama" land here rather than nowhere: an
    // unclassified novel is closer to general literary fiction than to any
    // genre's conventions, and they used to resolve to romance.
    aliases: ["literary", "literary fiction", "literary novel", "general fiction", "upmarket fiction", "fiction", "novel", "drama", "književnost", "roman", "proza"],
    conventions: `- Character and theme drive the story more than plot
- The prose itself is a feature — every sentence should be crafted
- Ambiguity and moral complexity are valued over clear resolution
- Internal transformation matters more than external events
- Social commentary, philosophical questions, and psychological depth
- Non-linear structure, unreliable narrators, and experimental forms are welcome
- Slow burn is acceptable if the prose rewards close reading
- The ending can be open, ambiguous, or bittersweet`,
    pacing: `- Slower, more contemplative pace is expected and valued
- Scenes can be built around a conversation, a memory, or a realization
- Tension comes from emotional stakes, not physical danger
- White space and silence are tools — what's not said can be as powerful as what is
- Flashbacks and time shifts are common and can structure the entire novel
- The "plot" might be a single day, a dinner party, or a walk home
- Build toward moments of epiphany rather than climactic action`,
    characterArcs: `- Deep psychological realism — characters should feel like real people
- Contradictions and inconsistencies are features, not bugs
- Characters don't need to be likeable, but they need to be interesting
- Arc may be subtle: a small shift in perspective, a moment of clarity
- Ensemble voices should be distinct enough to carry chapters
- Relationships (family, friendship, romantic) explored with nuance
- The unreliable narrator is a beloved literary device`,
    readerExpectations: `- Beautiful, precise prose that rewards rereading
- Emotional truth — characters feeling real, not performing
- Thematic depth that lingers after the book is closed
- Unique perspective on the human condition
- Sensory richness in specific details (not generic "beautiful sunset")
- Intelligence — don't explain what the reader can infer
- A voice that is unmistakably the author's own`,
    commonPitfalls: `- Navel-gazing with no narrative momentum at all
- Pretentious prose that prioritizes showing off over communication
- "Nothing happens" syndrome — even quiet novels need tension and stakes
- Characters as mouthpieces for the author's philosophy
- Neglecting plot entirely — even literary fiction has shape and structure
- Overwriting: using 50 words where 15 would be more powerful
- Becoming so invested in style that the story gets lost`,
    structureNotes: `Literary fiction often uses non-traditional structures:
- Episodic: connected scenes without traditional plot arc
- Spiral: returning to the same themes/events with deepening understanding
- Braided: multiple timelines woven together
- Frame narrative: story-within-a-story
- Epistolary: letters, documents, found texts
- Stream of consciousness: following thought patterns
- Fragmented: gaps and silences as structural elements

Whatever structure: there must still be emotional stakes and momentum.`,
    proseStyle: `- Precision over quantity — every word should earn its place
- Specific, concrete details (not "a tree" but "the copper beech")
- Metaphors should be original and earned — no clichés, no mixed metaphors
- Sentence rhythm varies deliberately — short punch, long flow
- Subtext carries emotional weight — what's beneath the surface
- Register shifts can signal emotional shifts
- The prose should reflect the character's consciousness in close POV
- Less is often more — trust the reader to fill in gaps`,
  },
  {
    genre: "science fiction",
    aliases: ["science fiction", "sci-fi", "sf", "hard sci-fi", "space opera", "cyberpunk", "dystopian", "naučna fantastika"],
    conventions: `- The speculative element (technology, society, science) should be central to the story
- "What if?" is the driving question — extrapolate one change and follow consequences
- Internal consistency of the speculative premise is paramount
- Hard SF: scientific accuracy matters; soft SF: social/philosophical themes matter
- The world should feel like a character — it shapes and constrains the story
- Technology should have social consequences — who benefits? Who is harmed?
- Space opera allows more fantasy-like liberties; hard SF demands rigor`,
    pacing: `- Open with the speculative hook — show the reader something they haven't seen
- Worldbuilding through action, not exposition dumps
- Alternate between wonder/exploration and human drama
- Technical explanations should be woven into plot necessity
- Escalation should follow the logic of the speculative premise
- The resolution should use the rules of the world creatively`,
    characterArcs: `- Characters should embody the story's thematic question
- How does the speculative element change human relationships?
- Fish-out-of-water perspectives help readers understand alien worlds
- AI, alien, or posthuman characters still need emotional truth
- The personal story should illuminate the larger speculative theme`,
    readerExpectations: `- Sense of wonder — show me something I haven't imagined
- Logical consistency — the rules should hold up to scrutiny
- Ideas that make them think differently about the real world
- Human truth amid inhuman circumstances
- Respect for the reader's intelligence — don't over-explain`,
    commonPitfalls: `- Infodumping technology/worldbuilding in the first chapters
- Characters who exist only to explain the world to the reader
- "Science" that is obviously wrong (check your physics, biology, etc.)
- Ignoring social consequences of technology
- The tech solves everything (no cost, no trade-offs)
- Alien cultures that are just Earth cultures with makeup`,
    structureNotes: `- Act 1: Establish the normal (of this world), introduce the disruption
- Act 2: Explore consequences, escalate stakes, deepen understanding
- Act 3: Resolution that uses the speculative premise's own logic
- Many SF novels use quest/journey structure through the speculative world`,
    proseStyle: `- Clear, precise prose — don't obscure ideas with flowery language
- Technical vocabulary should feel natural, not forced
- Sensory descriptions of alien/future environments are crucial
- Avoid present-day colloquialisms in far-future settings
- Match prose register to subgenre: cyberpunk is gritty; space opera is sweeping`,
  },
  {
    genre: "horror",
    aliases: ["horror", "supernatural horror", "psychological horror", "gothic", "gothic horror", "ghost story", "horor", "užas"],
    conventions: `- Dread is built, not announced — the reader must feel it before the characters name it
- The threat has rules, and the story is fair about them even when the characters are not told
- Isolation (physical, social or psychological) cuts off the ordinary escape routes
- The ordinary is made wrong before the monstrous appears
- Violence lands hardest when it is specific and brief, not catalogued
- An ending may deny full relief, but it must not deny meaning`,
    pacing: `- Act 1 (25%): Normal life with one wrong detail. The reader sees it before the protagonist does.
- Act 2a (25%): Escalating incidents; rational explanations are offered and slowly fail.
- Midpoint: The threat is confirmed — the story stops being deniable.
- Act 2b (25%): The rules of the threat are learned, usually at a cost.
- 75-85%: The worst loss. The protagonist's plan fails.
- Act 3 (15%): Confrontation on the threat's terms. Survival is never free.
- Alternate pressure and release — unbroken dread goes numb`,
    characterArcs: `- The protagonist's private flaw is the lever the threat uses
- Skeptics and believers both need to be intelligent; stupidity kills tension
- Supporting characters must be loved before they are lost, or the loss is free
- The survivor is changed — horror that leaves everyone intact reads as a ride, not a story
- The monster wants something specific; appetite without motive is scenery`,
    readerExpectations: `- Mounting dread, not just shocks
- A threat with internal logic the reader can reason about
- Bodily, sensory writing — cold, smell, texture, sound in the dark
- Real stakes: someone the reader cares for can die and does
- A confrontation, even if it is lost
- Aftermath that acknowledges the cost`,
    commonPitfalls: `- Jump scares on the page (they need timing the page cannot control)
- Explaining the monster until it stops being frightening
- Characters who fail to act in ways a real person would
- Gore substituted for tension
- A dream/hallucination reveal that cancels the reader's investment
- Ending on a "twist" that contradicts the rules the story established`,
    structureNotes: `Slow-burn dread structure:
1. Ordinary world with one wrong note
2. First incident — deniable
3. Second incident — witnessed
4. Investigation: the rules emerge
5. Escalation: a real loss
6. False sanctuary
7. The rules are broken or understood too late
8. Confrontation and cost
9. Aftermath — what the survivor carries`,
    proseStyle: `- Concrete sensory detail over abstraction: "the smell of wet coins", not "an eerie atmosphere"
- Short sentences at the moment of shock; longer ones while dread accumulates
- Withhold the full description of the threat; give parts, wrongly proportioned
- Silence, temperature and smell do more work than adjectives like "terrifying"
- Never tell the reader to be afraid`,
  },
  {
    genre: "historical fiction",
    aliases: ["historical fiction", "historical", "historical novel", "period fiction", "istorijski roman", "istorijska fikcija", "historical romance", "historical thriller"],
    conventions: `- The period is a constraint on the plot, not a costume on it
- Research is invisible: it shows in what characters take for granted
- Real historical figures are handled with care — invented action, plausible character
- Anachronism of thought is worse than anachronism of object: 21st-century attitudes in period mouths break the spell
- Language suggests the period without transcribing it
- An author's note distinguishing record from invention is expected`,
    pacing: `- Act 1 (25%): The world and its rules first — what is possible for this person, in this place, in this year.
- Act 2a (25%): The historical pressure arrives and narrows the protagonist's options.
- Midpoint: A public event and a private one collide.
- Act 2b (25%): Consequences the period makes irreversible (law, war, class, church, distance).
- Act 3 (25%): Resolution the period allows — not the one a modern reader would arrange.
- Let travel, letters and seasons take the time they really took`,
    characterArcs: `- The protagonist's wants are period-plausible even when their sympathies feel modern
- Constraints of class, gender, faith and law are the antagonist as often as any person
- Secondary characters carry the parts of the period the protagonist cannot see
- Growth is measured against what the era permitted, not against present-day freedom
- Avoid the lone enlightened hero who somehow holds every modern value`,
    readerExpectations: `- Immersion: food, work, money, weather, smell, the cost of things
- Accuracy in the details a reader can check
- Stakes that matter inside the period's own value system
- A story, not a lecture — research delivered through action
- Clarity about which events are real`,
    commonPitfalls: `- Research dumps disguised as dialogue ("As you know, Your Grace…")
- Modern idiom, modern medicine, modern psychology in period mouths
- Costume drama: the era as wallpaper behind a contemporary plot
- Flattening a period into a single attitude
- Using a real person to do something the record contradicts
- Dialect rendered phonetically until it is unreadable`,
    structureNotes: `- Anchor the private story to a datable public event, then let the two escalate together
- Dual timeline (past/present) is common; the present thread must earn its space, not just frame the past
- Chapter headers with place and date carry orientation cheaply
- Close with the period's own consequences, and an author's note for the record`,
    proseStyle: `- Period-flavoured, not period-imitating: current syntax, period vocabulary and reference
- Cut words the era did not have; keep sentences readable
- Concrete work detail — how a thing was actually done — builds authority fast
- Interiority in the era's own terms (duty, honour, sin, standing), not therapy language
- Let silence and formality do the work modern characters would do with speech`,
  },
  {
    genre: "young adult",
    aliases: ["young adult", "ya", "ya fiction", "teen fiction", "coming of age", "coming-of-age", "omladinski roman", "new adult"],
    conventions: `- A protagonist aged roughly 14–18, and the story belongs to them
- First person or close third; immediacy over retrospection
- The emotional problem is central even when the plot is external
- Adults are present but cannot solve it — the teenager must
- Firsts matter: first love, first betrayal, first real choice
- Hope is not required to be happy, but despair without agency is not the genre`,
    pacing: `- Act 1 (20%): Voice and world established fast — YA readers leave early or not at all.
- Act 2a (30%): The new situation, new allies, growing confidence.
- Midpoint: The protagonist chooses to be involved instead of being carried.
- Act 2b (30%): Costs land — friendship, family, identity, safety.
- Act 3 (20%): The protagonist acts on their own judgement, and the outcome is theirs.
- Chapters run short; scenes end on a turn`,
    characterArcs: `- Identity is the spine: who am I when nobody assigns it to me?
- Peer relationships carry the weight family carries in adult fiction
- The romance, if present, tests the protagonist's sense of self — it does not replace it
- Parents/guardians are real people with their own limits, not obstacles or furniture
- The ending grants agency, not a solved life`,
    readerExpectations: `- A voice that sounds like a person, not an adult performing youth
- Emotional honesty about shame, want, and unfairness
- Respect — no moralising, no lesson stapled to the end
- Pace: something changes every chapter
- Consequences that are real even when the book is kind`,
    commonPitfalls: `- Slang that will date the book within a year
- An adult narrator's hindsight leaking into the teenager's voice
- Issues handled as topics instead of as this character's specific life
- Adults absent for no reason the story explains
- A love interest with no life of their own
- Tidy resolution that cancels the cost`,
    structureNotes: `- Coming-of-age spine: assigned identity → disruption → experiment → failure → chosen identity
- The climax is a decision, not a rescue
- Keep the timeframe tight (weeks or a school year) unless the premise needs otherwise
- Epilogues are welcome when they show changed daily life, not a life plan`,
    proseStyle: `- Present-tense immediacy is common; either tense must feel in-the-moment
- Short paragraphs, concrete sensory detail, strong line-level voice
- Humour and pain sit in the same paragraph
- Metaphor drawn from the character's actual world, not a writer's library
- Avoid explaining the feeling after showing it`,
  },
  {
    genre: "memoir",
    aliases: ["memoir", "autobiography", "personal essay", "creative nonfiction", "narrative nonfiction", "memoari", "autobiografija"],
    conventions: `- One thread, not a whole life: the book is about something, and the life is the evidence
- The narrator is both the person who lived it and the person telling it — both voices are needed
- Truth claim: events are as remembered, and uncertainty is acknowledged rather than smoothed
- Other people are rendered fairly; private lives are handled with care
- Scene carries the story; reflection earns its place between scenes
- The reader is owed a reason this story is being told now`,
    pacing: `- Opening: the moment that made the book necessary, or the question it will answer
- Early: establish the world and the person you were, quickly
- Middle: scenes chosen for the thread, not for chronology — jump years without apology
- Turning point: the understanding that the younger self did not have
- Late: consequence and cost, not triumph
- Close: what remains unresolved, honestly`,
    characterArcs: `- The narrating self must understand more than the remembered self, and show the gap
- Family members need interiority, not caricature — even the ones who caused harm
- Self-justification is visible to readers; so is self-flagellation
- Growth is a change in seeing, not necessarily in circumstance
- The people who were kind deserve as much specificity as the people who were not`,
    readerExpectations: `- Scenes with dialogue and sensory detail, not summary
- Candour, including about the narrator's own failures
- A shape: the book goes somewhere the first chapter promised
- Reflection that illuminates rather than moralises
- Restraint about other people's private business`,
    commonPitfalls: `- Chronology mistaken for structure ("and then, and then")
- Score-settling, which readers detect immediately
- Withholding the narrator's own part in events
- Universalising ("we all know that…") instead of staying specific
- Therapy-language abstraction in place of scene
- Inventing dialogue at length while claiming strict accuracy — acknowledge reconstruction`,
    structureNotes: `- Choose a container: a year, a job, an illness, a journey, a relationship, an obsession
- Braided structure (past thread + present thread + a third strand of research or craft) is common and strong
- Each chapter is a scene plus the meaning wrested from it
- Front matter note on method (memory, journals, interviews) buys the reader's trust`,
    proseStyle: `- Concrete, particular detail; the specific is what makes a private life public property
- Two registers: the immediacy of the scene and the considered voice of the teller
- Understatement outperforms intensity when the material is painful
- Present tense for immersion, past tense for perspective — pick deliberately
- No summarising sentence that tells the reader what to feel`,
  },
];

/**
 * Look up the guide for a genre string.
 *
 * The old match was bidirectional substring — `alias.includes(query)` as well
 * as `query.includes(alias)` — so the genre "fiction" matched the romance
 * alias "romantic fiction" and every book filed as plain fiction was edited
 * to romance conventions. Matching is now:
 *
 *   1. exact on the guide's genre or one of its aliases;
 *   2. otherwise the LONGEST alias that appears as a whole phrase inside the
 *      query, so "historical romance novel" resolves to historical fiction
 *      rather than to romance.
 *
 * No match returns null, and null is an honest answer: a wrong genre guide
 * silently rewrites a book's conventions.
 */
export function getGenreGuide(genre: string | null | undefined): GenreGuide | null {
  if (!genre) return null;
  const normalized = genre.toLowerCase().trim().replace(/[_/]+/g, " ").replace(/\s+/g, " ");
  if (normalized.length === 0) return null;

  for (const guide of GENRE_GUIDES) {
    if (guide.genre === normalized || guide.aliases.includes(normalized)) return guide;
  }

  const words = normalized.split(" ");
  const containsPhrase = (alias: string): boolean => {
    const aliasWords = alias.split(" ");
    for (let i = 0; i + aliasWords.length <= words.length; i++) {
      if (aliasWords.every((w, j) => words[i + j] === w)) return true;
    }
    return false;
  };

  let best: { guide: GenreGuide; length: number } | null = null;
  for (const guide of GENRE_GUIDES) {
    for (const alias of guide.aliases) {
      if (!containsPhrase(alias)) continue;
      const length = alias.split(" ").length * 100 + alias.length;
      if (!best || length > best.length) best = { guide, length };
    }
  }
  return best?.guide ?? null;
}

/** Format genre guide for injection into agent prompt */
export function formatGenreGuideForPrompt(guide: GenreGuide): string {
  return `
<genre_guide genre="${guide.genre}">
## Genre Conventions
${guide.conventions}

## Pacing Guide
${guide.pacing}

## Character Arc Patterns
${guide.characterArcs}

## Reader Expectations
${guide.readerExpectations}

## Common Pitfalls to Avoid
${guide.commonPitfalls}

## Genre Structure Notes
${guide.structureNotes}

## Prose Style for This Genre
${guide.proseStyle}
</genre_guide>`;
}
