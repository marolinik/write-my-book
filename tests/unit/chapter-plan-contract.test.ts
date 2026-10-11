import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * plan-chapter promised a chapter plan and kept none (live run, 2026-10-11).
 *
 * On a fresh greenfield book the scene planner produced a full three-scene
 * beat sheet for chapter 1, the coach streamed it into the chat with "The
 * scene planner has created a detailed beat sheet for Chapter 1", and the run
 * ended `completed` with no CHAPTER_PLAN row. The next step the board offered,
 * write-chapter, then answered 422 "Chapter plan needed before writing".
 *
 * Two holes, both closed here:
 *   1. plan-chapter declared no `producesDocument`, so the D-188 contract
 *      (recover the deliverable from the run's own text, or report the run
 *      honestly) never looked at it.
 *   2. The CHAPTER_PLAN prerequisite was checked book-wide, so a plan for
 *      chapter 1 let the ghostwriter start chapter 5 with no plan at all.
 */

const h = vi.hoisted(() => ({ findByType: vi.fn(), create: vi.fn() }));

import { evaluateArtifactContract } from "@/lib/agents/artifact-contract";
import { getWorkflow } from "@/lib/agents/workflows";
import {
  isPrerequisiteMet,
  CHAPTER_SCOPED_DOCUMENT_TYPES,
  type PrerequisiteFacts,
} from "@/lib/agents/prerequisite-check";

/** The shape of the captured run's final text: a preamble, then the plan. */
const PLAN = [
  "The scene planner has created a detailed beat sheet for Chapter 1. Here's what it looks like:",
  "",
  "## Chapter 1 Plan: \"The Kiln\"",
  "",
  "**Overview:** 3 scenes, low tension, heavy on craft setup.",
  "",
  "### Scene 1: Fire and Breath",
  Array(60).fill("Mira works alone at the blowpipe from dawn and the gather resists her.").join(" "),
  "",
  "### Scene 2: The Keeper",
  Array(40).fill("Old Teodor watches without a word and sets the failed piece aside.").join(" "),
].join("\n");

const docService = () => ({ findByType: h.findByType, create: h.create });

beforeEach(() => {
  vi.clearAllMocks();
  h.create.mockResolvedValue({ id: "plan-recovered" });
});

describe("plan-chapter declares its deliverable", () => {
  it("promises a CHAPTER_PLAN", () => {
    expect(getWorkflow("plan-chapter")?.producesDocument).toBe("CHAPTER_PLAN");
  });

  it("treats CHAPTER_PLAN as a per-chapter document", () => {
    expect(CHAPTER_SCOPED_DOCUMENT_TYPES.has("CHAPTER_PLAN")).toBe(true);
  });
});

describe("artifact contract for a per-chapter document", () => {
  it("recovers the plan into THIS chapter when the model never saved it", async () => {
    h.findByType.mockResolvedValue(null);
    const out = await evaluateArtifactContract({
      workflowId: "plan-chapter",
      bookId: "b1",
      userId: "u1",
      chapterNumber: 1,
      assistantText: PLAN,
      documentIds: [],
      documentService: docService(),
    });
    expect(h.findByType).toHaveBeenCalledWith("CHAPTER_PLAN", 1);
    expect(h.create).toHaveBeenCalledTimes(1);
    const [type, , , chapterNumber] = h.create.mock.calls[0];
    expect(type).toBe("CHAPTER_PLAN");
    expect(chapterNumber).toBe(1);
    expect(out?.recovered).toBe(true);
    expect(out?.honest).toBe(true);
  });

  it("does not count another chapter's plan as this chapter's", async () => {
    // findByType is asked for chapter 5 only; a chapter-1 plan never answers.
    h.findByType.mockImplementation(async (_type: string, ch?: number) =>
      ch === 1 ? { id: "plan-ch1" } : null
    );
    const out = await evaluateArtifactContract({
      workflowId: "plan-chapter",
      bookId: "b1",
      userId: "u1",
      chapterNumber: 5,
      assistantText: PLAN,
      documentIds: [],
      documentService: docService(),
    });
    expect(h.findByType).toHaveBeenCalledWith("CHAPTER_PLAN", 5);
    expect(out?.recovered).toBe(true);
    expect(h.create.mock.calls[0][3]).toBe(5);
  });

  it("leaves an existing plan for the chapter untouched", async () => {
    h.findByType.mockResolvedValue({ id: "plan-existing" });
    const out = await evaluateArtifactContract({
      workflowId: "plan-chapter",
      bookId: "b1",
      userId: "u1",
      chapterNumber: 2,
      assistantText: PLAN,
      documentIds: [],
      documentService: docService(),
    });
    expect(h.create).not.toHaveBeenCalled();
    expect(out?.artifactExists).toBe(true);
  });

  it("reports nothing when the chapter is unknown rather than guess book-wide", async () => {
    const out = await evaluateArtifactContract({
      workflowId: "plan-chapter",
      bookId: "b1",
      userId: "u1",
      assistantText: PLAN,
      documentIds: [],
      documentService: docService(),
    });
    expect(out).toBeNull();
    expect(h.findByType).not.toHaveBeenCalled();
    expect(h.create).not.toHaveBeenCalled();
  });
});

describe("CHAPTER_PLAN prerequisite is per chapter", () => {
  const prereq = getWorkflow("write-chapter")!.prerequisites!.find((p) => p.value === "CHAPTER_PLAN")!;
  const facts = (chapterDocTypes?: string[]): PrerequisiteFacts => ({
    docTypes: new Set(["STORY_BIBLE", "ARCHITECTURE", "CHAPTER_PLAN"]),
    hasManuscript: false,
    chapterContent: true,
    chapterDocTypes: chapterDocTypes ? new Set(chapterDocTypes) : undefined,
  });

  it("is not met by a plan that belongs to another chapter", () => {
    expect(isPrerequisiteMet(prereq, facts([]))).toBe(false);
  });

  it("is met by the chosen chapter's own plan", () => {
    expect(isPrerequisiteMet(prereq, facts(["CHAPTER_PLAN"]))).toBe(true);
  });

  it("falls back to the book-wide answer before a chapter is chosen (panel)", () => {
    expect(isPrerequisiteMet(prereq, facts(undefined))).toBe(true);
  });

  it("leaves book-level documents book-wide", () => {
    const fingerprint = getWorkflow("write-chapter")!.prerequisites!.find((p) => p.value === "FINGERPRINT");
    expect(fingerprint).toBeDefined();
    const withFingerprint: PrerequisiteFacts = { ...facts([]), docTypes: new Set(["FINGERPRINT"]) };
    expect(isPrerequisiteMet(fingerprint!, withFingerprint)).toBe(true);
  });
});
