/**
 * Writing Craft Knowledge Base — preinstalled skills for all agents.
 * Comprehensive reference for narrative techniques, publishing standards,
 * and writing craft best practices.
 * Injected into agent prompts as supplementary knowledge.
 */

// ─── Narrative Techniques Reference ─────────────────────────────

export const NARRATIVE_TECHNIQUES = `
## Narrative Techniques Reference

### POV Types
- **First Person**: "I" narrator. Intimate but limited. Unreliable narration possible.
- **Close Third (Limited)**: "She/He" but only one character's thoughts per scene. Most common in modern fiction.
- **Omniscient Third**: Narrator knows all. Can reveal any character's thoughts. Classic but risks head-hopping if not controlled.
- **Second Person**: "You" narrator. Unusual, experimental. Works in short fiction and Choose Your Own Adventure.
- **Deep POV**: Third person so close it reads like first person without "I". No filter words, no narrator distance.

### Deep POV Checklist
✗ AVOID: "She saw the door open" → ✓ USE: "The door swung open"
✗ AVOID: "He felt his heart race" → ✓ USE: "His heart hammered"
✗ AVOID: "She thought it was wrong" → ✓ USE: "This was wrong"
✗ AVOID: "He heard a crash" → ✓ USE: "A crash echoed—"
✗ AVOID: "She noticed the blood" → ✓ USE: "Blood pooled on the tile"

### Show vs. Tell Transforms
✗ TELL: "She was angry" → ✓ SHOW: "Her fist clenched around the glass stem until it snapped"
✗ TELL: "He was sad" → ✓ SHOW: "He stared at the empty chair where she used to sit"
✗ TELL: "They were in love" → ✓ SHOW: Through actions, dialogue subtext, and physical awareness
✗ TELL: "The room was creepy" → ✓ SHOW: Specific sensory details that create unease

### Dialogue Best Practices
- Said is invisible — use it freely. "Asked" for questions. Everything else draws attention.
- Action beats > dialogue tags: "He slammed the table. 'Enough.'" instead of "'Enough,' he shouted."
- Subtext: Characters rarely say exactly what they mean. The gap between words and meaning creates tension.
- Each character needs a distinct voice: vocabulary, sentence length, verbal tics, education level.
- Avoid "As you know, Bob" exposition — characters shouldn't tell each other things they already know.

### Scene-Sequel Pattern (Dwight Swain)
SCENE: Goal → Conflict → Disaster
SEQUEL: Reaction → Dilemma → Decision
This pattern creates irresistible forward momentum.

### Tension on Every Page
Even "quiet" scenes need tension. Sources:
- Unspoken conflict between characters
- Dramatic irony (reader knows what character doesn't)
- Time pressure (even subtle: dinner is getting cold)
- Internal conflict (character wants two contradictory things)
- Environmental tension (approaching storm, locked door)
`;

// ─── AI-Tell Detection Knowledge ────────────────────────────────

export const AI_TELL_DETECTION = `
## AI Tell Detection — Forbidden Phrases & Patterns

### Tier 1: Immediate Flags (Strong AI Tells)
"delve into", "tapestry of", "testament to", "a dance of",
"sending shivers", "palpable tension", "in the realm of",
"it's worth noting", "couldn't help but", "a sense of wonder",
"navigating the complexities", "rich tapestry", "profound impact",
"beacon of hope", "unbeknownst to", "interplay between",
"multifaceted approach", "underscored by", "a symphony of",
"cascading effects", "myriad of", "plethora of"

### Tier 2: Suspect Patterns (May Be AI)
- Paragraphs starting with "As [character name]..."
- "The weight of [abstract noun]" (weight of responsibility, weight of silence)
- "[Character] couldn't help but [feel/notice/wonder]"
- "A mixture of [emotion] and [emotion] washed over"
- "Eyes widened" / "Heart pounded in chest" / "Breath caught"
- "It was clear that..." / "It was evident that..."
- Three-item lists with escalating intensity ("X, Y, and even Z")
- "Despite the [noun], [pronoun] felt [emotion]" pattern

### Tier 3: Structural AI Patterns
- Every paragraph is exactly 3-4 sentences
- Topic sentence → explanation → example → transition (essay structure in fiction)
- Emotional responses always follow the same order: physical sensation → thought → action
- Dialogue responses that perfectly address every point the other character made
- Descriptions that cover all 5 senses in systematic order
- Characters who are unfailingly articulate about their emotions

### Voice Preservation Rules
When rewriting to fix AI tells:
1. Preserve the author's sentence length distribution
2. Use vocabulary from the author's register (don't upgrade or downgrade)
3. Keep the author's punctuation patterns (em dashes, semicolons, etc.)
4. Match the author's metaphor domains
5. Maintain paragraph rhythm
`;

// ─── Publishing Standards ───────────────────────────────────────

export const PUBLISHING_STANDARDS = `
## Publishing Industry Standards

### Manuscript Formatting (for submission)
- Font: Times New Roman or Courier, 12pt
- Line spacing: Double-spaced
- Margins: 1 inch on all sides
- First line indent: 0.5 inch (no extra space between paragraphs)
- Scene breaks: # centered on a line by itself
- Chapter headings: Centered, all caps or title case
- Header: Author Last Name / TITLE / Page number
- No widow or orphan lines

### Word Count by Genre
- Literary Fiction: 70,000 – 100,000
- Commercial Fiction: 80,000 – 100,000
- Fantasy: 90,000 – 120,000 (epic: up to 150,000+)
- Science Fiction: 80,000 – 110,000
- Romance: 70,000 – 100,000 (category: 50,000 – 70,000)
- Thriller/Mystery: 80,000 – 100,000
- YA: 55,000 – 80,000
- Middle Grade: 25,000 – 50,000
- Picture Books: 500 – 1,000 (usually under 700)

### Query Letter Structure
1. Hook (1-2 sentences): What's unique about your story?
2. Setup (1 paragraph): Character + setting + inciting incident
3. Conflict (1-2 paragraphs): What happens, what's at stake
4. Bio (1 paragraph): Relevant credentials, comp titles
5. Closing: word count, genre, "complete manuscript available upon request"
Total length: 250-400 words. One page maximum.

### Synopsis Structure (1-2 pages)
- Present tense, third person (even if the novel is first person)
- Cover ALL major plot points including the ending
- Focus on protagonist's emotional journey
- Name only essential characters (5-6 maximum)
- Show cause and effect, not just "and then..."

### Blurb Structure (150-250 words)
1. Hook line (genre + premise)
2. Character introduction (who + what they want)
3. Conflict (what stands in their way)
4. Stakes (what happens if they fail)
5. Closing hook (question or tantalizing hint)
NEVER reveal the ending in a blurb.
`;

// ─── Sensitivity Reading Guidelines ─────────────────────────────

export const SENSITIVITY_GUIDELINES = `
## Sensitivity Reading Guidelines

### Principles
- Representation matters: diverse characters should be three-dimensional, not tokens
- Stereotypes are not the same as archetypes — stereotypes reduce, archetypes explore
- "Own voices" perspective: acknowledge when writing outside your experience
- Power dynamics: be aware of historical context for marginalized groups
- Avoid the "magical minority" trope (where a marginalized character exists only to help the protagonist)

### Common Issues to Flag
- Physical descriptions: Avoid comparing skin color to food (chocolate, caramel, almond)
- Disability: Characters with disabilities should have agency and not exist as "inspiration"
- Mental health: Avoid romanticizing or simplifying complex conditions
- Cultural practices: Research thoroughly; avoid exoticizing or othering
- Gender and sexuality: Avoid using queer characters solely for tragedy
- Religion: Treat all faiths with the same depth and nuance
- Historical trauma: Handle with care, specificity, and respect

### Recommendation
Flag potential sensitivity issues in findings with category "sensitivity" and severity "suggestion".
Do NOT rewrite — only note the concern and why it matters. The author makes the final call.
`;

// ─── Compile all skills for injection ───────────────────────────

export function getAllCraftSkills(): string {
  return [
    NARRATIVE_TECHNIQUES,
    AI_TELL_DETECTION,
    PUBLISHING_STANDARDS,
    SENSITIVITY_GUIDELINES,
  ].join("\n\n");
}
