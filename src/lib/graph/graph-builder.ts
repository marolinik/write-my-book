/**
 * Graph builder: takes extracted entities and MERGE-upserts them into Neo4j.
 * Incremental: uses content hashes to skip unchanged sections.
 * Handles renames via alias tracking.
 */

import { withSession } from "./neo4j-client";
import { RELATIONSHIP_TYPES } from "./types";
import type {
  ExtractionResult,
  ExtractedEntity,
  ExtractedRelationship,
  GraphNodeLabel,
} from "./types";

interface UpsertStats {
  nodesCreated: number;
  nodesUpdated: number;
  relationshipsCreated: number;
}

/**
 * Upsert all entities and relationships from an extraction result into Neo4j.
 * Uses MERGE on (bookId, name) for each entity so repeated runs are idempotent.
 *
 * `authoritative` (D-80) distinguishes a DELIBERATE user/agent correction
 * (UpdateGraphEntity → true) from a STOCHASTIC re-extraction (post-session /
 * chapter-graph rebuild → default false). Sub-fix 7(b) makes a Character's
 * `dead` status sticky and role/description preserve-first so a noisy re-scan
 * cannot churn continuity-load-bearing facts — but that must NEVER silently
 * swallow an explicit correction. When `authoritative` is true, status / role /
 * description are written directly (the sticky/preserve-first guards are
 * bypassed) so the edit lands; every non-authoritative caller stays sticky.
 */
export async function upsertEntities(
  result: ExtractionResult,
  authoritative: boolean = false
): Promise<UpsertStats> {
  const stats: UpsertStats = {
    nodesCreated: 0,
    nodesUpdated: 0,
    relationshipsCreated: 0,
  };

  if (result.entities.length === 0 && result.relationships.length === 0) {
    return stats;
  }

  // D-30 guard: every graph write MUST be scoped to the calling book. The type
  // requires bookId, but a legacy/buggy caller could still pass an empty value
  // at runtime — refuse loudly rather than write unscoped (or, worse, let a
  // name-only MATCH touch other books' graphs).
  if (!result.bookId) {
    console.error(
      "[graph-builder] upsertEntities called without bookId — refusing to write unscoped graph data (D-30)"
    );
    return stats;
  }

  await withSession("WRITE", async (session) => {
    // Pass 1: Upsert all entities
    for (const entity of result.entities) {
      const entityStats = await upsertSingleEntity(
        session,
        entity,
        result.bookId,
        result.chapterNumber,
        result.contentHash,
        result.userId,
        authoritative
      );
      stats.nodesCreated += entityStats.created;
      stats.nodesUpdated += entityStats.updated;
    }

    // Pass 2: Create all relationships
    for (const rel of result.relationships) {
      const created = await upsertRelationship(
        session,
        rel,
        result.bookId,
        result.chapterNumber,
        result.userId
      );
      if (created) {
        stats.relationshipsCreated += 1;
      }
    }
  });

  return stats;
}

/**
 * Upsert a single entity node. First checks aliases to find existing nodes
 * that may have been renamed, then does a MERGE on (bookId, name).
 */
async function upsertSingleEntity(
  session: import("neo4j-driver").Session,
  entity: ExtractedEntity,
  bookId: string,
  chapterNumber: number,
  contentHash: string,
  userId?: string,
  authoritative: boolean = false
): Promise<{ created: number; updated: number }> {
  const { name, label, properties, aliases } = entity;

  // If the entity has aliases, check whether any existing node matches an alias.
  // This handles renames: if a character was previously stored under an alias,
  // we find that node and add the new name as an alias instead of creating a duplicate.
  //
  // D-30 hardening: bind the AUTHORITATIVE bookId from the extraction result,
  // not properties.bookId (which is caller-injected and could be missing — a
  // null bookId here made the alias lookup silently match nothing, and the
  // MERGE below used to fall back to bookId "" creating unscoped nodes).
  if (aliases && aliases.length > 0) {
    // Sub-fix 7(c) / D-27-adjacent: find existing nodes this entity's aliases
    // could bind to. The old query folded on a SINGLE shared alias + `LIMIT 1`,
    // so two DISTINCT characters that merely share a common title/first-name
    // ("Doctor", "Captain") collapsed into one node — a D8 false-positive that
    // silently LOSES a character — and `LIMIT 1` picked an arbitrary node when
    // several matched. We now return ALL candidates (no LIMIT) so the decision
    // logic can (1) refuse to guess when ≥2 candidates match and (2) refuse to
    // fold on a common/stop alias. `existingAliases` is returned so we can tell
    // a DISTINCTIVE linking token from a common one.
    const aliasResult = await session.run(
      // `OR n.name = $name` (HIGH, Fable c-fold-safety): also surface a
      // pre-existing node whose stored name is EXACTLY our incoming name even
      // when its stored aliases don't intersect ours — otherwise that node is
      // invisible to the lookup, hasExactNameNode stays false, and the MERGE's
      // own node gets redirected onto a coincidental alias-sibling. The exact
      // node is excluded from `candidates` by the `existingName !== name`
      // filter, so it only needs to trip the exact-name guard.
      `MATCH (n:${escapeLabelForQuery(label)} {bookId: $bookId})
       WHERE n.name IN $aliases OR any(a IN coalesce(n.aliases, []) WHERE a IN $aliases) OR n.name = $name
       RETURN n.name AS existingName, coalesce(n.aliases, []) AS existingAliases
       ORDER BY n.firstAppearance, n.name`,
      {
        bookId,
        name,
        aliases,
      }
    );

    // A node whose stored name is EXACTLY our incoming name is the same node the
    // MERGE below hits directly — never fold away from it onto a different node.
    const hasExactNameNode = aliasResult.records.some(
      (r) => (r.get("existingName") as string) === name
    );
    // Candidate nodes under a DIFFERENT spelling than our incoming name.
    const candidates = aliasResult.records
      .map((r) => ({
        existingName: r.get("existingName") as string,
        existingAliases: (r.get("existingAliases") as string[]) ?? [],
      }))
      .filter((c) => c.existingName && c.existingName !== name);

    // Bind via alias ONLY when the match is UNAMBIGUOUS *and* backed by STRONG
    // identity evidence — never a coincidental shared descriptor (RC-3 /
    // Fable c-fold-safety). ≥2 candidates → DO NOTHING (keep separate rather
    // than guess). For the sole candidate, two evidence classes can fold:
    //   1. a genuine NAME↔ALIAS rename — the candidate's stored NAME is one of
    //      our incoming aliases, or our incoming NAME is a stored alias of the
    //      candidate (still not a bare common title, so "Doctor"↔"Doctor" is
    //      declined);
    //   2. a DISTINCTIVE shared alias — a handle both list that is not a common
    //      title, not an epithet ("the Stranger"), and not a word appearing in
    //      BOTH full names (a shared surname/first name = same FAMILY, not the
    //      same person: two "Reynolds" siblings / two "Anna"s stay separate).
    // A merely shared surname/first-name/epithet/rank is a WEAK signal and never
    // folds. Preserve/do-nothing is always preferred over a false fold: a false
    // fold loses a character (D8) and cannot be undone by a later scan.
    if (!hasExactNameNode && candidates.length === 1) {
      const candidate = candidates[0];
      const hasRenameLink = renameLinkTokens(name, aliases, candidate).some(
        (token) => !isCommonAlias(token)
      );
      const hasDistinctiveSharedAlias = candidate.existingAliases.some(
        (a) =>
          aliases.includes(a) &&
          a !== name &&
          a !== candidate.existingName &&
          isDistinctiveSharedAlias(a, name, candidate.existingName)
      );
      if (hasRenameLink || hasDistinctiveSharedAlias) {
        // Fold onto the existing node: keep ITS spelling as the primary name and
        // UNION our name + every incoming alias into its alias set. D-27: the
        // fold only APPENDS (never replaces), so no existing variant — including
        // a diacritic one already stored on the node — is ever dropped.
        const foldAliases = Array.from(new Set([name, ...aliases])).filter(
          (a) => a !== candidate.existingName
        );
        await session.run(
          `MATCH (n:${escapeLabelForQuery(label)} {bookId: $bookId, name: $existingName})
           SET n.aliases = coalesce(n.aliases, []) + [a IN $foldAliases WHERE NOT a IN coalesce(n.aliases, [])],
               n.updatedAt = datetime(),
               n.lastMentioned = $chapter
           RETURN n`,
          {
            bookId,
            existingName: candidate.existingName,
            foldAliases,
            chapter: chapterNumber,
          }
        );
        return { created: 0, updated: 1 };
      }
    }
  }

  // Sub-fix 7(a) / D-32c: Event-name canonicalization before MERGE. The MERGE
  // identity is the RAW {bookId, name}, so "The Wedding" and "Wedding" fork into
  // distinct Event nodes even though they are the same event. We resolve an
  // incoming Event onto an EXISTING Event whose canonical form matches, WITHOUT
  // changing the raw MERGE key — so no existing node forks, the first-seen
  // display spelling is preserved, and the fold composes with the RC-2 coalesce
  // and D-27 alias union already applied to the node below.
  //
  // Scoped to Event ONLY: a false-merge of two Characters is worse than of two
  // Events (it silently loses a character), and character identity is sub-fix
  // (c)'s concern — so Characters/Objects are never canonical-folded here.
  //
  // Shape (see fix7a-handoff.md): keep MERGE on the raw {bookId, name}; add a
  // pre-MERGE lookup that finds an existing Event sharing this canonical key and,
  // when found under a DIFFERENT spelling, fold onto ITS stored name and push our
  // spelling into the alias union. A `canonicalName` property is stamped going
  // forward so the lookup is a single equality; a legacy node (pre-fix, no
  // canonicalName) is still caught by the enumerated article-variant name
  // candidates and self-heals its canonicalName on that match. Every value rides
  // as a Cypher param; the label stays escaped — the injection boundary is
  // unchanged.
  let mergeName = name;
  let canonicalName: string | undefined;
  let foldedAlias: string | undefined;
  if (label === "Event") {
    canonicalName = canonicalizeEntityName(name);
    // Enumerate the article-variant spellings that all canonicalize to this key,
    // so a pre-fix node (no stored canonicalName) is still found by literal name.
    const nameCandidates = Array.from(
      new Set([
        name,
        canonicalName,
        `The ${canonicalName}`,
        `A ${canonicalName}`,
        `An ${canonicalName}`,
      ])
    );
    const canonicalMatch = await session.run(
      `MATCH (n:${escapeLabelForQuery(label)} {bookId: $bookId})
       WHERE n.canonicalName = $canonicalName OR n.name IN $nameCandidates
       RETURN n.name AS existingName
       ORDER BY n.firstAppearance, n.name
       LIMIT 1`,
      { bookId, canonicalName, nameCandidates }
    );
    if (canonicalMatch.records.length > 0) {
      const existingName = canonicalMatch.records[0].get("existingName") as string;
      // Only FOLD when the existing node carries a DIFFERENT spelling — an
      // exact-name match already merges through the raw MERGE key untouched, so
      // it must not spuriously self-alias.
      if (existingName && existingName !== name) {
        mergeName = existingName;
        foldedAlias = name;
      }
    }
  }

  // When we fold onto a differently-spelled existing Event, keep our own spelling
  // as an alias so no variant / prose spelling is lost (unioned via D-27 below).
  const effectiveAliases =
    foldedAlias !== undefined
      ? Array.from(new Set([...(aliases ?? []), foldedAlias]))
      : aliases;

  // Build properties map for Cypher (name is in the MERGE key; bookId is
  // pinned to the authoritative value so a stray/missing properties.bookId
  // can never relabel or unscope the node)
  const now = new Date().toISOString();
  const allProps: Record<string, unknown> = {
    ...properties,
    bookId,
    contentHash,
    lastMentioned: chapterNumber,
    updatedAt: now,
  };
  // chapter / occursInChapter (Event) and deathChapter (Character) are
  // application-derived facts, and aliases is a UNION-not-replace set (D-27) —
  // all handled below with stable / union semantics. Keep them OUT of allProps
  // so the ON MATCH `+= $updateProps` merge cannot destructively overwrite them.
  delete allProps.chapter;
  delete allProps.occursInChapter;
  delete allProps.deathChapter;
  delete allProps.aliases;
  // Sub-fix 7(a): canonicalName is the identity MATCH KEY the pre-MERGE lookup
  // folds on (`n.canonicalName = $canonicalName`). It MUST be application-derived
  // only — never an LLM value. The extraction `properties` are unconstrained
  // model output (record_narrative_graph passes them unfiltered; UpdateGraphEntity
  // is an open object; agents now SEE canonicalName on QueryGraph results, so a
  // round-trip echo is realistic), so a smuggled `properties.canonicalName` left
  // in the `+= $updateProps` map would survive ON MATCH and — because Neo4j does
  // not specify snapshot SET semantics — be read back by the trailing coalesce
  // and frozen, deterministically false-merging a DISTINCT Event via the lookup.
  // Strip it so the app-derived canonicalName stamped in createProps / the
  // coalesce param is the ONLY writer, exactly as bookId (D-30) and userId (RC-6)
  // are protected in this same block.
  delete allProps.canonicalName;
  // RC-6 defense in depth: stamp the authoritative tenant onto the node when the
  // caller supplied one. Never trust a caller-injected userId in `properties`;
  // strip it and set only the authoritative value. Omitting it (legacy callers)
  // leaves any previously-stamped userId intact on ON MATCH.
  delete allProps.userId;
  if (userId) {
    allProps.userId = userId;
  }

  // Sub-fix 7(b) / D-32a: role, status and description are continuity- and
  // signature-load-bearing, so they must NOT be blanket-overwritten by every
  // stochastic re-extraction through `+= $updateProps`. Pull them out of the
  // merge map (like chapter/aliases above) and apply deterministic ON MATCH
  // rules built below:
  //
  //  - status: `dead` is a STICKY terminal state. dead_character_reappears
  //    (graph-queries.ts) gates on the literal `c.status = "dead"`, so a later
  //    scan emitting "transformed"/"alive"/"unknown" MUST NOT downgrade a node
  //    already recorded dead — otherwise the check silently disarms until a
  //    lucky later scan re-asserts "dead" (the D-32a / D1 driver). `dead` is the
  //    ONLY status value any continuity check reads as a gate, so it is the only
  //    one frozen; a genuine FIRST-TIME death still lands (a non-dead node
  //    adopts the incoming status) and Object/PlotThread statuses (never "dead")
  //    keep updating exactly as before.
  //  - role / description: preserve-first-non-empty. `description` is read by no
  //    continuity gate; `role` is read by exactly one — character_undocumented
  //    (graph-queries.ts) keys off the placeholder `c.role = "mentioned"`, so
  //    that placeholder is treated as empty-equivalent (below) to let a real
  //    documented role upgrade land. Churning either just destabilises the
  //    entity signature (hurting D8 precision). The first scan supplying a
  //    non-empty (non-placeholder for role) value wins; later stochastic scans
  //    neither overwrite it nor unbounded-append.
  //
  // All three are still written verbatim on ON CREATE (re-added to createProps
  // below), and a scan that omits a field leaves the stored value untouched.
  const incomingStatus = allProps.status;
  const incomingRole = allProps.role;
  const incomingDescription = allProps.description;
  const hasStatus = isNonEmptyString(incomingStatus);
  const hasRole = isNonEmptyString(incomingRole);
  const hasDescription = isNonEmptyString(incomingDescription);
  delete allProps.status;
  delete allProps.role;
  delete allProps.description;

  // D-19: Event.chapter and Character.deathChapter are read by
  // runConsistencyChecks() (graph-queries.ts) but the extraction LLM is never
  // asked for them and never reliably emits them. We stamp them deterministically
  // from the chapter being scanned — mirroring how relationship.chapter is
  // injected in upsertRelationship() — so those checks can populate at all.
  //
  // Both are STABLE, FIRST-OCCURRENCE facts (like firstAppearance, NOT
  // lastMentioned): written on ON CREATE, and on ON MATCH preserved via coalesce
  // so a later re-scan / re-mention never overwrites the original. Setting them
  // on ON CREATE too means a Character introduced already-dead (posthumous /
  // off-page death) gets deathChapter, not only a live→dead transition seen on a
  // later match; and an Event keeps the chapter it OCCURRED in, not the chapter
  // it was last mentioned in.
  const derived = deriveEntityGraphProps(label, properties, chapterNumber);

  const createProps: Record<string, unknown> = { ...allProps };
  const onMatchStableItems: string[] = [];
  if (derived.chapter !== undefined) {
    // Event.chapter — NARRATING chapter (display / timeline ordering).
    createProps.chapter = derived.chapter;
    onMatchStableItems.push("n.chapter = coalesce(n.chapter, $chapter)");
  }
  if (derived.occursInChapter !== undefined) {
    // Event.occursInChapter — STORY-time (RC-2). Stable first-occurrence fact,
    // preserved on ON MATCH via coalesce so a re-scan can't churn it. Carries
    // its own $occursInChapter param since it may differ from the narrating
    // $chapter (a flashback narrated later still occurs in its earlier chapter).
    //
    // FP-A guard (regression vs committed D-19): a PRE-FIX legacy Event
    // (occursInChapter NULL, e.g. chapter=3) re-mentioned during a LATER
    // chapter's extraction (say ch9) arrives here with $chapter=$occursInChapter=9
    // and, by the stochastic default, no rule-8 hint. A naive
    // coalesce(n.occursInChapter, $occursInChapter) would backfill 9 — inventing a
    // story-time that re-opens the exact D-32(b) dead_character_reappears FP and
    // FREEZES it (coalesce never overwrites the now non-null value; re-scanning
    // the origin chapter can't repair it). Instead, only adopt the supplied
    // story-time when this IS the node's origin chapter (n.chapter = $chapter);
    // otherwise backfill from the node's OWN narrating chapter, which reproduces
    // the pre-fix read semantics exactly. A legacy node thus learns real
    // story-time only when re-scanned at its origin chapter; post-fix
    // CREATE-stamped nodes already carry occursInChapter, so coalesce keeps it.
    createProps.occursInChapter = derived.occursInChapter;
    onMatchStableItems.push(
      "n.occursInChapter = coalesce(n.occursInChapter, CASE WHEN n.chapter = $chapter THEN $occursInChapter ELSE n.chapter END)"
    );
  }
  if (derived.deathChapter !== undefined) {
    // Character.deathChapter — powers dead_character_reappears. derived.deathChapter
    // === chapterNumber, so the $chapter param serves both the create value and
    // the match-preserve coalesce.
    createProps.deathChapter = derived.deathChapter;
    onMatchStableItems.push("n.deathChapter = coalesce(n.deathChapter, $chapter)");
  }
  if (effectiveAliases && effectiveAliases.length > 0) {
    // D-27: aliases are UNIONed, never replaced. Seed the set on ON CREATE; on
    // ON MATCH append only the aliases not already present, preserving every
    // existing variant — so a later chapter emitting a subset (e.g. ["Zoe"])
    // cannot drop an existing diacritic variant ("Zoë"). Kept out of the
    // `+= $updateProps` map, which would destructively overwrite the array.
    // Sub-fix 7(a): when an Event folded onto a differently-spelled node, the
    // incoming spelling is included here so the variant is preserved as an alias.
    createProps.aliases = effectiveAliases;
    onMatchStableItems.push(
      "n.aliases = coalesce(n.aliases, []) + [a IN $aliases WHERE NOT a IN coalesce(n.aliases, [])]"
    );
  }
  if (label === "Event" && canonicalName !== undefined) {
    // Sub-fix 7(a): stamp the derived canonical MATCH key so future variant
    // scans converge via a single equality. STABLE first-occurrence fact (the
    // MERGE key `name` is immutable for a node, so its canonicalName never
    // changes): seeded on ON CREATE, coalesced on ON MATCH so a re-scan cannot
    // churn it AND a legacy node (matched by article-variant candidate) backfills
    // its canonicalName. Kept out of the `+= $updateProps` map. The incoming
    // canonical always equals the matched node's canonical (the lookup matched on
    // exactly that), so the coalesce backfill is always correct.
    createProps.canonicalName = canonicalName;
    onMatchStableItems.push(
      "n.canonicalName = coalesce(n.canonicalName, $canonicalName)"
    );
  }
  // Sub-fix 7(b): monotonic status + preserve-first-non-empty role/description.
  // Written verbatim on ON CREATE; guarded on ON MATCH so STOCHASTIC re-scans
  // cannot churn load-bearing facts. Values ride as Cypher params ($incoming*),
  // never interpolated, so the injection boundary is unchanged.
  //
  // D-80: an `authoritative` write (a DELIBERATE UpdateGraphEntity correction)
  // bypasses the sticky/preserve-first guards and sets the value directly — the
  // guards exist to tame noisy re-extraction, NOT to swallow an explicit edit
  // (that would be a silent failure-states-lie: "1 updated" while nothing moved).
  if (hasStatus) {
    createProps.status = incomingStatus;
    if (authoritative) {
      // Deliberate correction: land it (even dead→alive).
      onMatchStableItems.push("n.status = $incomingStatus");
    } else if (label === "Character") {
      // D-81: `dead` is a STICKY terminal state for CHARACTERS ONLY — it is the
      // sole status literal any continuity gate reads (dead_character_reappears,
      // graph-queries.ts). A stochastic downgrade (transformed/alive/unknown)
      // must not silently disarm it.
      onMatchStableItems.push(
        'n.status = CASE WHEN n.status = "dead" THEN n.status ELSE $incomingStatus END'
      );
    } else {
      // D-81: other labels never carry "dead" as a gate value; stickiness would
      // only freeze an erroneously-scanned "dead" Object/PlotThread out of its
      // own gates forever. Restore plain latest-wins (exact pre-(b) behaviour).
      onMatchStableItems.push("n.status = $incomingStatus");
    }
  }
  if (
    authoritative &&
    label === "Character" &&
    hasStatus &&
    !isDeadStatus(incomingStatus)
  ) {
    // D-80: a DELIBERATE move away from "dead" retires the death anchor too, so
    // the dead_character_reappears gate (status="dead" AND deathChapter IS NOT
    // NULL) cannot linger on a stale deathChapter. (Setting a Neo4j property to
    // null removes it.) Stochastic scans never reach this branch; and when the
    // authoritative status IS "dead", the untouched deathChapter coalesce clause
    // above stamps the first-death anchor instead.
    onMatchStableItems.push("n.deathChapter = null");
  }
  if (hasRole) {
    createProps.role = incomingRole;
    if (authoritative) {
      onMatchStableItems.push("n.role = $incomingRole");
    } else {
      // Preserve-first-non-empty. The placeholder role "mentioned" (what the
      // character_undocumented check keys off, graph-queries.ts) is treated as
      // empty-equivalent so a later DOCUMENTED role upgrade lands — otherwise the
      // undocumented flag would fire forever and the real role never stick.
      onMatchStableItems.push(
        'n.role = CASE WHEN n.role IS NULL OR n.role = "" OR n.role = "mentioned" THEN $incomingRole ELSE n.role END'
      );
    }
  }
  if (hasDescription) {
    createProps.description = incomingDescription;
    if (authoritative) {
      onMatchStableItems.push("n.description = $incomingDescription");
    } else {
      onMatchStableItems.push(
        'n.description = CASE WHEN n.description IS NULL OR n.description = "" THEN $incomingDescription ELSE n.description END'
      );
    }
  }
  const onMatchClause =
    onMatchStableItems.length > 0
      ? `ON MATCH SET n += $updateProps, ${onMatchStableItems.join(", ")}`
      : "ON MATCH SET n += $updateProps";

  const mergeParams: Record<string, unknown> = {
    bookId,
    // Sub-fix 7(a): `mergeName` is the incoming raw `name` UNLESS this Event
    // folded onto an existing node under a different spelling, in which case it
    // is that existing node's stored name so the MERGE hits (not forks) it.
    name: mergeName,
    chapter: chapterNumber,
    createProps,
    updateProps: allProps,
  };
  if (derived.occursInChapter !== undefined) {
    mergeParams.occursInChapter = derived.occursInChapter;
  }
  if (effectiveAliases && effectiveAliases.length > 0) {
    mergeParams.aliases = effectiveAliases;
  }
  if (label === "Event" && canonicalName !== undefined) {
    mergeParams.canonicalName = canonicalName;
  }
  if (hasStatus) {
    mergeParams.incomingStatus = incomingStatus;
  }
  if (hasRole) {
    mergeParams.incomingRole = incomingRole;
  }
  if (hasDescription) {
    mergeParams.incomingDescription = incomingDescription;
  }

  // Use MERGE on (bookId, name) with ON CREATE / ON MATCH
  const mergeResult = await session.run(
    `MERGE (n:${escapeLabelForQuery(label)} {bookId: $bookId, name: $name})
     ON CREATE SET n += $createProps, n.id = randomUUID(), n.createdAt = datetime(), n.firstAppearance = $chapter
     ${onMatchClause}
     RETURN n.createdAt = n.updatedAt AS isNew`,
    mergeParams
  );

  if (mergeResult.records.length > 0) {
    // ON CREATE sets createdAt = datetime() and ON MATCH does not,
    // so we check if the node was just created by checking the return value
    const record = mergeResult.records[0];
    const isNew = record.get("isNew") as boolean;
    return isNew ? { created: 1, updated: 0 } : { created: 0, updated: 1 };
  }

  return { created: 0, updated: 0 };
}

/**
 * Upsert a relationship between two entities OF THE CALLING BOOK.
 * Uses MERGE to avoid duplicates.
 *
 * D-30 fix: both endpoint MATCHes bind {name, bookId}. The previous query
 * matched by name alone with only a relative `WHERE a.bookId = b.bookId`,
 * which produced the cross-product of same-named pairs across ALL books
 * (including other users' — character names are author-chosen free text) and
 * MERGEd the edge onto every pair: one book's extraction silently corrupted
 * every other book containing the same character names, producing false
 * continuity flags in books the author never touched.
 */
async function upsertRelationship(
  session: import("neo4j-driver").Session,
  rel: ExtractedRelationship,
  bookId: string,
  chapterNumber: number,
  userId?: string
): Promise<boolean> {
  const { from, fromLabel, to, toLabel, type, properties } = rel;

  // Defense in depth (D-30): never run the MERGE without a book scope.
  if (!bookId) {
    console.error(
      `[graph-builder] Refusing to upsert relationship ${from}-[${type}]->${to} without bookId (D-30)`
    );
    return false;
  }

  const relProps: Record<string, unknown> = {
    ...(properties ?? {}),
    chapter: chapterNumber,
    updatedAt: new Date().toISOString(),
    // RC-6 defense in depth: tag the edge's owning tenant when known.
    ...(userId ? { userId } : {}),
  };

  // D-63: `type` is free-form LLM output (the agent UpdateGraphEntity tool
  // declares it an unconstrained string and the `as RelationshipType` cast is a
  // runtime no-op), so it MUST be sanitized before it is interpolated into the
  // relationship pattern below — exactly as node labels go through
  // escapeLabelForQuery(). Without this, a crafted type breaks out of `[r:...]`
  // and runs unscoped Cypher across every tenant's graph.
  const relType = sanitizeRelationshipType(type);

  // D-86: after sub-fix 7(a) folds an Event variant onto a surviving node (e.g.
  // "The Wedding" → stored "Wedding"), a same-batch relationship that names the
  // folded-away spelling would MATCH nothing by literal {name, bookId} and be
  // silently dropped — losing the very LEADS_TO timeline edges RC-3 needs.
  // Resolve each EVENT endpoint through the SAME canonical/article-variant
  // lookup sub-fix (a) uses so an edge naming a variant spelling attaches to the
  // surviving node. Event-scoped (Characters/Objects are matched literally,
  // mirroring (a)'s Event-only canonical fold), read-only, and conservative: it
  // never creates a node and never cross-folds two distinct events. When an
  // endpoint does not resolve, the literal name is kept so the MATCH behaves
  // exactly as before (finds nothing → edge not written → no crash). The two
  // resolver reads live INSIDE the try (LOW, Fable d86 lens): a transient driver
  // error while resolving one endpoint must skip only THIS edge, not abort the
  // rest of the relationship batch.
  try {
    const fromName =
      fromLabel === "Event"
        ? await resolveEventEndpointName(session, bookId, from)
        : from;
    const toName =
      toLabel === "Event"
        ? await resolveEventEndpointName(session, bookId, to)
        : to;

    const result = await session.run(
      `MATCH (a:${escapeLabelForQuery(fromLabel)} {name: $fromName, bookId: $bookId})
       MATCH (b:${escapeLabelForQuery(toLabel)} {name: $toName, bookId: $bookId})
       MERGE (a)-[r:${relType}]->(b)
       ON CREATE SET r += $props, r.createdAt = datetime()
       ON MATCH SET r += $props
       RETURN r`,
      {
        fromName,
        toName,
        bookId,
        props: relProps,
      }
    );
    return result.records.length > 0;
  } catch (error) {
    console.error(
      `[graph-builder] Failed to upsert relationship ${from}-[${type}]->${to}:`,
      error
    );
    return false;
  }
}

/**
 * D-86: resolve an EVENT relationship-endpoint name onto the stored name of the
 * surviving Event node it canonicalizes to, so an edge that names an
 * article/whitespace/unicode variant — or a spelling sub-fix 7(a) folded away —
 * still attaches instead of being silently dropped.
 *
 * Read-only and conservative: it mirrors sub-fix (a)'s pre-MERGE lookup exactly
 * (canonicalName equality OR the enumerated article-variant name candidates,
 * scoped to {bookId} and the Event label, ORDER BY firstAppearance for
 * determinism). It NEVER creates a node and NEVER cross-folds two distinct
 * events — a name that canonicalizes to a different key matches nothing. When no
 * Event resolves, the original literal name is returned so the caller's MATCH
 * behaves exactly as before (finds nothing → edge not written → no crash). All
 * values ride as Cypher params; the Event label is a literal (Event-scoped by
 * definition), so the injection boundary is unchanged.
 */
async function resolveEventEndpointName(
  session: import("neo4j-driver").Session,
  bookId: string,
  name: string
): Promise<string> {
  const canonicalName = canonicalizeEntityName(name);
  const nameCandidates = Array.from(
    new Set([
      name,
      canonicalName,
      `The ${canonicalName}`,
      `A ${canonicalName}`,
      `An ${canonicalName}`,
    ])
  );
  const match = await session.run(
    `MATCH (n:Event {bookId: $bookId})
     WHERE n.canonicalName = $canonicalName OR n.name IN $nameCandidates
     RETURN n.name AS existingName
     ORDER BY n.firstAppearance, n.name
     LIMIT 1`,
    { bookId, canonicalName, nameCandidates }
  );
  if (match.records.length > 0) {
    const existingName = match.records[0].get("existingName") as string;
    if (existingName) {
      return existingName;
    }
  }
  return name;
}

/**
 * Remove entities that were ONLY sourced from a specific chapter.
 * Used before re-extraction to clean up stale data.
 * Entities that appear in multiple chapters are preserved.
 */
export async function removeChapterEntities(
  bookId: string,
  chapterNumber: number
): Promise<void> {
  await withSession("WRITE", async (session) => {
    // Remove relationships tagged with this chapter that don't exist in other chapters
    await session.run(
      `MATCH (n {bookId: $bookId})-[r]-(m {bookId: $bookId})
       WHERE r.chapter = $chapter
       AND NOT EXISTS {
         MATCH (n)-[r2]-(m)
         WHERE r2.chapter <> $chapter
       }
       DELETE r`,
      { bookId, chapter: chapterNumber }
    );

    // Remove nodes that only appeared in this chapter (firstAppearance = lastMentioned = chapter)
    await session.run(
      `MATCH (n {bookId: $bookId})
       WHERE n.firstAppearance = $chapter
       AND n.lastMentioned = $chapter
       AND NOT EXISTS {
         MATCH (n)-[r]-()
         WHERE r.chapter <> $chapter
       }
       DETACH DELETE n`,
      { bookId, chapter: chapterNumber }
    );
  });
}

/**
 * Escape a label string for safe use in Cypher queries.
 * Labels can only contain alphanumeric characters and underscores.
 */
function escapeLabelForQuery(label: GraphNodeLabel): string {
  // Our labels are from a fixed enum, but sanitize anyway
  return label.replace(/[^a-zA-Z0-9_]/g, "");
}

/**
 * Canonical relationship-type lookup keyed by UPPERCASE form, so a case /
 * whitespace variant from the LLM (e.g. "allied_with") normalizes back to the
 * exact union member the continuity checks key off (":ALLIED_WITH").
 */
const CANONICAL_RELATIONSHIP_TYPES: ReadonlyMap<string, string> = new Map(
  RELATIONSHIP_TYPES.map((t) => [t, t])
);

/**
 * Fallback used when a relationship type sanitizes to the empty string (all
 * symbols / whitespace). Deliberately NOT a member of RelationshipType, so it
 * lands in a neutral bucket instead of silently colliding with a
 * continuity-check type.
 */
const RELATIONSHIP_TYPE_FALLBACK = "RELATED_TO";

/**
 * Sanitize an LLM-supplied relationship type before it is interpolated into a
 * Cypher `MERGE (a)-[r:${type}]->(b)` pattern (D-63).
 *
 * The value is untrusted free-form model output, so a crafted string such as
 * `KNOWS]->(b) WITH a MATCH (n) DETACH DELETE n //` would otherwise break out
 * of the relationship pattern and run attacker Cypher across every tenant's
 * graph. Neo4j relationship types are `[A-Za-z0-9_]`:
 *
 *   (a) a known type (case-insensitive, trimmed) → its canonical union form;
 *   (b) anything else → uppercased and stripped to a bare `[A-Z0-9_]` identifier
 *       (a leading digit is prefixed with `_` so the bare type is valid Cypher
 *       rather than a syntax error — turning a would-be silent drop into a write);
 *   (c) an empty / all-symbol result → RELATIONSHIP_TYPE_FALLBACK, never empty.
 *
 * The result always matches /^[A-Za-z0-9_]+$/, so it cannot contain the
 * brackets, spaces, or comment markers an injection needs. Exported for unit
 * testing.
 */
export function sanitizeRelationshipType(raw: unknown): string {
  const asString = typeof raw === "string" ? raw : String(raw ?? "");
  const normalized = asString.trim().toUpperCase();

  const canonical = CANONICAL_RELATIONSHIP_TYPES.get(normalized);
  if (canonical) {
    return canonical;
  }

  const stripped = normalized.replace(/[^A-Z0-9_]/g, "");
  if (stripped.length === 0) {
    return RELATIONSHIP_TYPE_FALLBACK;
  }
  return /^[0-9]/.test(stripped) ? `_${stripped}` : stripped;
}

/**
 * Continuity properties derived deterministically at upsert time (D-19).
 *
 * The consistency checks in graph-queries.ts read these; they are NOT taken
 * from the (unreliable) LLM output but injected from application code, mirroring
 * how relationship.chapter is set in upsertRelationship().
 */
export interface DerivedEntityGraphProps {
  /** Event.chapter — NARRATING chapter this Event was extracted from. */
  chapter?: number;
  /**
   * Event.occursInChapter — STORY-time chapter (RC-2 / D-32). Defaults to the
   * narrating chapter; overridden by a validated LLM story-time hint so a
   * flashback / retelling narrated later does not present as a present-time
   * event to the consistency checks.
   */
  occursInChapter?: number;
  /** Character.deathChapter — chapter a death was first detected (>= 1). */
  deathChapter?: number;
}

/**
 * Coerce an untrusted story-time hint (LLM-emitted `occursInChapter`) into a
 * non-negative integer chapter, or `undefined` when it is absent/garbage so the
 * caller can fall back to the narrating chapter. Accepts a number or a clean
 * integer string; rejects negatives, non-integers, NaN, and anything else. A
 * value ABOVE the narrating chapter is allowed (a prophecy/foreshadowing of a
 * future event is legitimately narrated before it happens). Exported for tests.
 */
export function coerceStoryChapter(raw: unknown): number | undefined {
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && raw.trim() !== ""
        ? Number(raw)
        : NaN;
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

/**
 * True when a Character's status means "dead" — matched to the exact value the
 * dead_character_reappears check keys off (`c.status = "dead"`), tolerating
 * surrounding whitespace/case. A synonym like "deceased" is intentionally NOT
 * treated as dead: the check compares against the literal "dead", so recording
 * a deathChapter for any other value could never make it fire.
 */
export function isDeadStatus(status: unknown): boolean {
  return typeof status === "string" && status.trim().toLowerCase() === "dead";
}

/**
 * True when a value is a non-empty (post-trim) string. Used by sub-fix 7(b) to
 * decide whether an incoming scan actually supplied a role/status/description
 * worth writing — an absent or blank value leaves the stored property untouched
 * rather than churning or blanking it. Exported for unit testing.
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * Common/stop alias tokens (sub-fix 7(c)): bare titles, honorifics, ranks, and
 * familial words that are shared by MANY distinct characters. Such a token is a
 * WEAK identity signal, so it must never on its own anchor an alias-fold — two
 * different "the Doctor"s or "Captain"s are almost always different people. The
 * list is lower-cased. Completeness matters in the ENABLE direction: a MISSING
 * entry makes that bare title read as DISTINCTIVE, which ENABLES a false fold of
 * two distinct characters (not merely "declines to merge"). This list covers the
 * bounded title/honorific/familial vocab; the unbounded name space (shared
 * surnames/first names) is caught instead by the shared-name-word guard in
 * {@link isDistinctiveSharedAlias}.
 */
const COMMON_ALIAS_STOPWORDS: ReadonlySet<string> = new Set([
  // articles
  "the", "a", "an",
  // honorifics / courtesy titles
  "mr", "mrs", "ms", "miss", "mx", "madam", "madame", "sir", "dame",
  "dr", "doctor", "prof", "professor",
  // nobility / rank
  "lord", "lady", "master", "mistress", "king", "queen", "prince",
  "princess", "duke", "duchess", "earl", "count", "countess", "baron",
  "baroness",
  // military / office / law
  "captain", "capt", "commander", "colonel", "major", "general", "sergeant",
  "sgt", "lieutenant", "lt", "admiral", "corporal", "private", "officer",
  "detective", "inspector", "agent", "chief", "boss", "warden", "mayor",
  "governor", "president", "senator", "judge", "nurse",
  "sheriff", "marshal", "constable", "deputy", "magistrate",
  "doc", "cap", "sarge", "coach",
  // non-English honorifics / courtesy titles (bounded vocab, unlike names)
  "señor", "senor", "señora", "senora", "señorita", "senorita",
  "don", "doña", "dona", "herr", "frau", "fräulein", "fraulein", "doktor",
  "monsieur", "mademoiselle", "signor", "signore", "signora", "signorina",
  "san", "sama", "sensei", "sahib", "sheikh", "sheik",
  // familial (incl. colloquial fiction forms)
  "father", "mother", "mom", "mum", "dad", "papa", "mama", "brother",
  "sister", "uncle", "aunt", "auntie", "granny", "grandma", "grandpa",
  "grandmother", "grandfather", "cousin", "son", "daughter", "boy", "girl",
  "ma", "pa", "pop", "pops", "gran", "grandad", "granddad", "nan", "nana",
  "nanna", "mommy", "mummy", "daddy", "bro", "sis",
  // religious (incl. colloquial clergy forms)
  "reverend", "rev", "bishop", "cardinal", "pope", "rabbi", "imam", "priest",
  "pastor", "deacon", "saint", "st", "padre", "vicar", "parson", "chaplain",
  "friar", "monk", "nun", "elder",
]);

/**
 * True when an alias token is a COMMON/stop alias (sub-fix 7(c)) — i.e. EVERY
 * whitespace-separated word is a title/stop word, so the token is a bare
 * title/honorific/familial term ("Doctor", "the Captain") rather than a
 * distinctive handle. "Captain Reynolds" is NOT common (the surname is
 * distinctive). Non-string / empty tokens are treated as common (they carry no
 * distinctive identity signal). Exported for unit testing.
 */
export function isCommonAlias(token: unknown): boolean {
  if (typeof token !== "string") {
    return true;
  }
  const normalized = token.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
  if (normalized === "") {
    return true;
  }
  return normalized.split(" ").every((word) => {
    const bare = word.replace(/^[.,'"!?;:]+|[.,'"!?;:]+$/g, "");
    return bare === "" || COMMON_ALIAS_STOPWORDS.has(bare);
  });
}

/**
 * STRONG rename-evidence tokens linking an incoming entity to a candidate node
 * in the alias-rename path (sub-fix 7(c)) — a genuine NAME↔ALIAS link, NOT a
 * coincidentally shared descriptor:
 *   - the candidate's stored NAME is one of our incoming aliases (the classic
 *     "stored under an alias, now revealed" rename), or
 *   - the candidate already lists OUR name among its aliases (reverse rename).
 * A merely shared THIRD alias is deliberately NOT a rename link (that path
 * false-folds surname/first-name/epithet/rank siblings) — it is handled
 * separately by {@link isDistinctiveSharedAlias}. Each token here must still be
 * distinctive (not a bare common title) at the call site, so "Doctor"↔"Doctor"
 * never folds. Exported for unit testing.
 */
export function renameLinkTokens(
  incomingName: string,
  incomingAliases: readonly string[],
  candidate: { existingName: string; existingAliases: readonly string[] }
): string[] {
  const tokens = new Set<string>();
  if (incomingAliases.includes(candidate.existingName)) {
    tokens.add(candidate.existingName);
  }
  if (candidate.existingAliases.includes(incomingName)) {
    tokens.add(incomingName);
  }
  return [...tokens];
}

/**
 * An alias that begins with a leading article ("the Stranger", "a Traveller")
 * is an EPITHET — a descriptor many distinct characters can share, never a
 * rename. Such a token never anchors a shared-alias fold. Exported for testing.
 */
export function isEpithetAlias(token: unknown): boolean {
  if (typeof token !== "string") return false;
  // Leading article — English + common Romance/Germanic/Italian forms, so
  // "El Lobo" / "La Sombra" / "Der Wolf" / "Il Corvo" are recognized as
  // epithets, not just "the …".
  return /^(the|a|an|el|la|los|las|le|les|der|die|das|il|lo|gli)\s+\S/i.test(
    token.normalize("NFC").replace(/^\s+/, "")
  );
}

/**
 * The words of a full display name / alias, normalized for word-level comparison
 * (Fable guard-attack hardening). A single principled pass that collapses the
 * surface-form variance an extractor emits, so the shared-name-word guard sees
 * through it:
 *   - NFD-decompose + strip combining marks → "Zoë"/"Jose" and "José" unify;
 *   - unify apostrophe forms (U+2018/2019/02BC/FF07 → U+0027) → curly-vs-straight
 *     "O'Brien" unify;
 *   - split on unicode whitespace AND all dashes (\p{Pd}, incl. ASCII "-") →
 *     "Reynolds-Vane"→["reynolds","vane"], "Anne-Marie"→["anne","marie"];
 *   - lowercase; strip surrounding punctuation; drop empties.
 * "Z. Rasmussen" → ["z","rasmussen"]; "José García" → ["jose","garcia"].
 * This only ever ADDS word-matches, so it can only make the guard DECLINE more
 * folds — never enable one (fail-safe). c3's "Zoë"←"Z. Rasmussen" fold is
 * unaffected: "zoe" is still a word in only ONE of the two names.
 */
function nameWords(fullName: string): string[] {
  return fullName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritical marks
    .replace(/[‘’ʼ＇]/g, "'") // unify apostrophe forms
    .toLowerCase()
    .split(/[\s\p{Pd}]+/u)
    .map((w) => w.replace(/^[.,'"!?;:]+|[.,'"!?;:]+$/g, ""))
    .filter((w) => w.length > 0);
}

/**
 * Whether a THIRD alias shared by the incoming entity and its sole candidate is
 * STRONG enough identity evidence to fold on (sub-fix 7(c) / Fable
 * c-fold-safety). It must be:
 *   - not a common title/honorific (bounded vocab — {@link isCommonAlias}),
 *   - not an epithet (leading article — {@link isEpithetAlias}), and
 *   - not a word that appears in BOTH characters' full names (a shared
 *     surname/first-name = same FAMILY, not the same person — the UNBOUNDED
 *     name space a stop-list cannot cover).
 * This keeps two "Reynolds" siblings and two "Anna"s separate while still
 * folding a diacritic variant ("Zoë" links "Zoë Rasmussen" ← "Z. Rasmussen":
 * "Zoë" is a word in only ONE of the two names). Exported for unit testing.
 */
export function isDistinctiveSharedAlias(
  token: string,
  incomingName: string,
  existingName: string
): boolean {
  if (isCommonAlias(token)) return false;
  if (isEpithetAlias(token)) return false;
  const incomingWords = new Set(nameWords(incomingName));
  const existingWords = new Set(nameWords(existingName));
  const sharedFamilyToken = nameWords(token).some(
    (w) => incomingWords.has(w) && existingWords.has(w)
  );
  return !sharedFamilyToken;
}

/**
 * Canonicalize an Event name into a deterministic MATCH KEY used to converge
 * article / whitespace / unicode variants of the SAME event before MERGE
 * (sub-fix 7(a) / D-32c). Same-batch stochastic extraction refers to one event
 * two ways ("The Wedding" vs "Wedding"); because the MERGE identity is the RAW
 * `{bookId, name}`, the two spellings fork into distinct nodes — both stamped
 * the same chapter, so every LEADS_TO becomes chXX→chXX and timeline_violation
 * is unconstructible.
 *
 * Transform (order matters; deterministic AND idempotent):
 *   1. Unicode NFC normalize (so a combining "é" and a precomposed "é"
 *      fold to the same key);
 *   2. collapse internal whitespace runs to a single space + trim;
 *   3. strip ONE leading definite/indefinite article ("The "/"A "/"An ",
 *      case-insensitive) — but ONLY when a non-empty remainder survives, so a
 *      one-word title that IS an article (e.g. "The") is left intact.
 *
 * It deliberately does NOT lowercase, stem, or fold possessives/genitives:
 * lowercasing destroys display fidelity of the remainder, and stemming /
 * possessive folding ("X's Death" ≡ "Death of X") risk FALSE-MERGING two
 * DISTINCT events — itself a D8 false-positive. The STORED `name` keeps its
 * original spelling; only this derived key is normalized. The residual
 * (possessive forking, remainder-case forking) is registered as D-85. Exported
 * for unit testing.
 */
export function canonicalizeEntityName(rawName: unknown): string {
  if (typeof rawName !== "string") {
    return "";
  }
  const normalized = rawName.normalize("NFC").replace(/\s+/g, " ").trim();
  const deArticled = normalized.replace(/^(?:the|an|a)\s+/i, "");
  return deArticled.length > 0 ? deArticled : normalized;
}

/**
 * Derive the application-controlled continuity properties for an entity being
 * upserted during chapter `chapterNumber`'s extraction.
 *
 * - Event.chapter powers location_conflict (e1.chapter = e2.chapter) and
 *   timeline_violation (later.chapter > earlier.chapter).
 * - Character.deathChapter powers dead_character_reappears. Only derived for
 *   in-story chapters (>= 1); chapter 0 is the canonical story bible, where a
 *   "dead" status is pre-story backstory rather than an in-story death event.
 */
export function deriveEntityGraphProps(
  label: GraphNodeLabel,
  properties: Record<string, unknown>,
  chapterNumber: number
): DerivedEntityGraphProps {
  const derived: DerivedEntityGraphProps = {};

  if (label === "Event") {
    derived.chapter = chapterNumber;
    // Story-time: use a valid LLM hint if present, else the narrating chapter.
    // Chapter 0 (story bible) events keep story-time 0 as well.
    const hint = coerceStoryChapter(properties.occursInChapter);
    derived.occursInChapter = hint !== undefined ? hint : chapterNumber;
  }

  if (
    label === "Character" &&
    chapterNumber >= 1 &&
    isDeadStatus(properties.status)
  ) {
    derived.deathChapter = chapterNumber;
  }

  return derived;
}
