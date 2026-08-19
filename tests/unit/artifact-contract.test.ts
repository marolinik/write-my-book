import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * D-188 — `create-story-bible` reported success and persisted nothing.
 *
 * Captured 2/2 on a clean 8-chapter import: POST /agent {create-story-bible}
 * returned 200, streamed a complete Story Bible into the chat, and terminated
 * with `metadata.success = true`, `endReason "natural"`, `documentIds: []`,
 * assistant text ending verbatim "**Story Bible Status:** Complete and ready
 * for reference." `WriteDocument` was never called and no STORY_BIBLE row
 * existed. Consequence: `build-architecture` 422 "Story Bible needed before
 * designing architecture" — the very step the product then recommended — and
 * `dev-edit` 422 "Setup incomplete". Both runs were billed to the writer.
 *
 * Contract locked here: for a workflow that DECLARES a document artifact,
 * "success with no artifact" is structurally impossible. Either the artifact is
 * persisted (recovered from the run's own transcript when the model streamed it
 * but never called the tool), or the run is reported as a failure.
 */

const h = vi.hoisted(() => ({
  findByType: vi.fn(),
  create: vi.fn(),
}));

import {
  looksLikeDeliverable,
  claimsArtifactComplete,
  evaluateArtifactContract,
  filterBlockedNextSteps,
} from "@/lib/agents/artifact-contract";
import { getWorkflow } from "@/lib/agents/workflows";

/** A real story-bible-shaped payload (headings + substance). */
const BIBLE = [
  "# Story Bible — Dead Reckoning",
  "",
  "## Characters",
  "| Name | Role | Arc |",
  "| --- | --- | --- |",
  "| Marek | protagonist | ledger-keeper who learns to trust |",
  "",
  "## World Rules",
  Array(220).fill("The harbour freezes by November and the customs office keeps two sets of books.").join(" "),
  "",
  "## Themes",
  "Debt as inheritance; the cost of an honest account.",
  "",
  "**Story Bible Status:** Complete and ready for reference.",
].join("\n");

const docService = () => ({ findByType: h.findByType, create: h.create });

beforeEach(() => {
  vi.clearAllMocks();
  h.create.mockResolvedValue({ id: "doc-recovered" });
});

describe("looksLikeDeliverable", () => {
  it("accepts a long, structured document", () => {
    expect(looksLikeDeliverable(BIBLE)).toBe(true);
  });

  it("rejects an ordinary conversational turn", () => {
    expect(
      looksLikeDeliverable(
        "Great — tell me about your protagonist. What does Marek want, and what is standing in his way?"
      )
    ).toBe(false);
  });

  it("rejects long prose with no structure at all", () => {
    // A wall of chat is not a reference document; persisting it would be its
    // own lie, so length alone must not qualify.
    expect(looksLikeDeliverable(Array(400).fill("words").join(" "))).toBe(false);
  });

  it("rejects empty / whitespace text", () => {
    expect(looksLikeDeliverable("")).toBe(false);
    expect(looksLikeDeliverable("   \n\n ")).toBe(false);
  });
});

describe("claimsArtifactComplete", () => {
  it("detects the captured claim", () => {
    expect(
      claimsArtifactComplete("**Story Bible Status:** Complete and ready for reference.")
    ).toBe(true);
  });

  it("detects short save/creation claims", () => {
    expect(claimsArtifactComplete("Your story bible is saved.")).toBe(true);
    expect(claimsArtifactComplete("I've created the architecture document for you.")).toBe(true);
  });

  it("does not fire on a question or a plan to do it later", () => {
    expect(claimsArtifactComplete("Shall I write the story bible now?")).toBe(false);
    expect(claimsArtifactComplete("Tell me about the world and I'll draft it.")).toBe(false);
  });
});

describe("evaluateArtifactContract", () => {
  it("no-ops for a workflow that declares no artifact", async () => {
    expect(
      await evaluateArtifactContract({
        workflowId: "discuss-chapter",
        bookId: "b1",
        userId: "u1",
        assistantText: "Anything at all",
        documentService: docService(),
      })
    ).toBeNull();
  });

  it("honest pass when the run really wrote the document", async () => {
    h.findByType.mockResolvedValue({ id: "doc-1" });

    const out = await evaluateArtifactContract({
      workflowId: "create-story-bible",
      bookId: "b1",
      userId: "u1",
      assistantText: "Story bible saved.",
      documentIds: ["doc-1"],
      documentService: docService(),
    });

    expect(out).toMatchObject({
      expectedType: "STORY_BIBLE",
      artifactExists: true,
      recovered: false,
      honest: true,
    });
    expect(h.create).not.toHaveBeenCalled();
  });

  it("THE DEFECT: streamed bible + no WriteDocument → recovered and persisted", async () => {
    h.findByType.mockResolvedValue(null);

    const out = await evaluateArtifactContract({
      workflowId: "create-story-bible",
      bookId: "b1",
      userId: "u1",
      assistantText: BIBLE,
      documentIds: [],
      documentService: docService(),
    });

    expect(out).toMatchObject({
      expectedType: "STORY_BIBLE",
      artifactExists: true,
      recovered: true,
      honest: true,
    });
    expect(out?.documentId).toBe("doc-recovered");
    // Persisted as the declared type, with the transcript content and a
    // provenance-bearing changeSource.
    const [type, content, , , , changeSource] = h.create.mock.calls[0];
    expect(type).toBe("STORY_BIBLE");
    expect(content).toBe(BIBLE);
    expect(changeSource).toBe("transcript-recovery");
    // The writer is told what happened rather than left guessing.
    expect(out?.message).toMatch(/story bible/i);
  });

  it("claims complete, nothing recoverable → DISHONEST (run must not report success)", async () => {
    h.findByType.mockResolvedValue(null);

    const out = await evaluateArtifactContract({
      workflowId: "create-story-bible",
      bookId: "b1",
      userId: "u1",
      assistantText: "Your story bible is complete and saved.",
      documentIds: [],
      documentService: docService(),
    });

    expect(out).toMatchObject({
      artifactExists: false,
      recovered: false,
      claimedComplete: true,
      honest: false,
    });
    expect(h.create).not.toHaveBeenCalled();
    expect(out?.message).toMatch(/not saved|nothing was saved|no .* document/i);
  });

  it("ordinary in-progress conversational turn stays honest (no false alarm)", async () => {
    h.findByType.mockResolvedValue(null);

    const out = await evaluateArtifactContract({
      workflowId: "create-story-bible",
      bookId: "b1",
      userId: "u1",
      assistantText: "Who is your protagonist, and what do they want?",
      documentIds: [],
      documentService: docService(),
    });

    expect(out).toMatchObject({
      artifactExists: false,
      recovered: false,
      claimedComplete: false,
      honest: true,
    });
    expect(h.create).not.toHaveBeenCalled();
  });

  it("never overwrites an artifact that already exists", async () => {
    // A real STORY_BIBLE from an earlier session must not be clobbered with
    // chat text just because this turn also looks document-shaped.
    h.findByType.mockResolvedValue({ id: "doc-old" });

    const out = await evaluateArtifactContract({
      workflowId: "create-story-bible",
      bookId: "b1",
      userId: "u1",
      assistantText: BIBLE,
      documentIds: [],
      documentService: docService(),
    });

    expect(out).toMatchObject({ artifactExists: true, recovered: false, honest: true });
    expect(h.create).not.toHaveBeenCalled();
  });

  it("reads the declaration off the workflow registry", () => {
    // The contract is data on the workflow, not a second hard-coded map.
    expect(getWorkflow("create-story-bible")?.producesDocument).toBe("STORY_BIBLE");
    expect(getWorkflow("build-architecture")?.producesDocument).toBe("ARCHITECTURE");
    expect(getWorkflow("capture-style")?.producesDocument).toBe("FINGERPRINT");
    expect(getWorkflow("discuss-chapter")?.producesDocument).toBeUndefined();
  });

  it("recovery failure is reported honestly, not swallowed", async () => {
    h.findByType.mockResolvedValue(null);
    h.create.mockRejectedValue(new Error("s3 down"));

    const out = await evaluateArtifactContract({
      workflowId: "create-story-bible",
      bookId: "b1",
      userId: "u1",
      assistantText: BIBLE,
      documentIds: [],
      documentService: docService(),
    });

    expect(out).toMatchObject({ artifactExists: false, recovered: false, honest: false });
  });
});

/**
 * D-188's consequence chain, second link: the run advertised
 * `suggestedNext: ["build-architecture"]` while the STORY_BIBLE that step
 * requires did not exist, so the product recommended a step it then rejected
 * with 422. A suggestion whose prerequisites are unmet is replaced by the
 * workflow that satisfies them, never advertised as the next move.
 */
describe("filterBlockedNextSteps", () => {
  const satisfied = { satisfied: true, missing: [] };

  it("keeps suggestions whose prerequisites are met", async () => {
    const out = await filterBlockedNextSteps(["build-architecture"], async () => satisfied);
    expect(out).toEqual(["build-architecture"]);
  });

  it("replaces a blocked suggestion with the workflow that unblocks it", async () => {
    const out = await filterBlockedNextSteps(["build-architecture"], async () => ({
      satisfied: false,
      missing: [
        {
          description: "Story Bible needed before designing architecture",
          satisfiedBy: "create-story-bible",
        },
      ],
    }));
    expect(out).toEqual(["create-story-bible"]);
  });

  it("drops a blocked suggestion that nothing can satisfy", async () => {
    const out = await filterBlockedNextSteps(["dev-edit"], async () => ({
      satisfied: false,
      missing: [{ description: "Import chapters first" }],
    }));
    expect(out).toEqual([]);
  });

  it("de-duplicates and preserves order", async () => {
    const out = await filterBlockedNextSteps(
      ["build-architecture", "plan-chapter", "create-story-bible"],
      async (id) =>
        id === "create-story-bible"
          ? satisfied
          : {
              satisfied: false,
              missing: [{ description: "x", satisfiedBy: "create-story-bible" }],
            }
    );
    expect(out).toEqual(["create-story-bible"]);
  });

  it("passes an empty list straight through", async () => {
    expect(await filterBlockedNextSteps([], async () => satisfied)).toEqual([]);
  });
});
