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
    aliases: ["literary", "literary fiction", "literary novel", "general fiction", "upmarket fiction", "književnost"],
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
];

/** Look up genre guide by genre string (fuzzy matching on aliases) */
export function getGenreGuide(genre: string | null | undefined): GenreGuide | null {
  if (!genre) return null;
  const normalized = genre.toLowerCase().trim();
  return GENRE_GUIDES.find(g =>
    g.genre === normalized || g.aliases.some(a => normalized.includes(a) || a.includes(normalized))
  ) ?? null;
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
