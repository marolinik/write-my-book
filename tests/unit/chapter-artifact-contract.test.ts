/**
 * A-13 — a ghostwritten chapter that was never saved is not a success.
 *
 * `write-chapter` mandated WriteChapter only inside REVISION MODE and declared
 * no artifact at all, so the D-188 contract — which catches exactly this for
 * documents — could not see a lost draft. A chapter could be streamed into the
 * panel, summarised approvingly, and gone the moment the writer closed it,
 * with `success: true` and an empty chapter behind it.
 *
 * The chapter branch asks a narrower question than the document one: did THIS
 * run write the chapter's content document? A chapter that merely exists
 * proves nothing, because `revise` starts from prose that is already there.
 */

import { describe, it, expect, vi } from "vitest";
import {
  evaluateArtifactContract,
  looksLikeChapterProse,
  TRANSCRIPT_RECOVERY_SOURCE,
  type ArtifactDocumentStore,
} from "@/lib/agents/artifact-contract";
import { getWorkflow } from "@/lib/agents/workflows";

const PROSE = Array.from({ length: 12 }, (_, i) =>
  `The salt had dried white along the window frame, and ${"she counted it again, ".repeat(
    4
  )} as if the counting were a kind of prayer number ${i}.`
).join("\n\n");

function store(existing: { id: string } | null): ArtifactDocumentStore & {
  create: ReturnType<typeof vi.fn>;
} {
  return {
    findByType: vi.fn(async () => existing),
    create: vi.fn(async () => ({ id: "recovered-doc" })),
  };
}

const base = {
  workflowId: "write-chapter",
  bookId: "book-1",
  userId: "user-1",
  chapterNumber: 7,
  language: "en",
};

describe("the workflows whose deliverable is prose", () => {
  it("declare it", () => {
    expect(getWorkflow("write-chapter")?.producesChapter).toBe(true);
    expect(getWorkflow("revise")?.producesChapter).toBe(true);
    // Freewrite is exploratory and conversational — it promises nothing.
    expect(getWorkflow("freewrite")?.producesChapter).toBeUndefined();
    // CHAPTER_CONTENT must never reach series auto-synthesis.
    expect(getWorkflow("write-chapter")?.producesDocument).toBeUndefined();
  });
});

describe("recognising a chapter in the run's own text", () => {
  it("accepts long, paragraphed prose", () => {
    expect(looksLikeChapterProse(PROSE)).toBe(true);
  });

  it("rejects a report about a chapter", () => {
    const report = `# Chapter 7 Summary\n\n## What I wrote\n\n${"Analysis of the beats. ".repeat(
      200
    )}`;
    expect(looksLikeChapterProse(report)).toBe(false);
  });

  it("rejects a short confirmation", () => {
    expect(looksLikeChapterProse("Done — chapter 7 is written and saved.")).toBe(false);
    expect(looksLikeChapterProse(undefined)).toBe(false);
  });
});

describe("a run that saved the chapter", () => {
  it("is honest and writes nothing further", async () => {
    const docs = store({ id: "chapter-doc" });
    const outcome = await evaluateArtifactContract({
      ...base,
      assistantText: "I wrote chapter 7 — 3,400 words.",
      documentIds: ["chapter-doc"],
      documentService: docs,
    });
    expect(outcome?.artifactExists).toBe(true);
    expect(outcome?.honest).toBe(true);
    expect(outcome?.recovered).toBe(false);
    expect(docs.create).not.toHaveBeenCalled();
  });
});

describe("a run that streamed the chapter and never saved it", () => {
  it("recovers the prose into an empty chapter", async () => {
    const docs = store(null);
    const outcome = await evaluateArtifactContract({
      ...base,
      assistantText: PROSE,
      documentIds: [],
      documentService: docs,
    });
    expect(outcome?.recovered).toBe(true);
    expect(outcome?.artifactExists).toBe(true);
    expect(outcome?.honest).toBe(true);
    expect(docs.create).toHaveBeenCalledWith(
      "CHAPTER_CONTENT",
      PROSE,
      "Chapter 7",
      7,
      undefined,
      TRANSCRIPT_RECOVERY_SOURCE
    );
  });

  it("never overwrites prose the writer already has", async () => {
    const docs = store({ id: "existing-chapter-doc" });
    const outcome = await evaluateArtifactContract({
      ...base,
      workflowId: "revise",
      assistantText: PROSE,
      documentIds: [], // the run wrote nothing
      documentService: docs,
    });
    expect(docs.create).not.toHaveBeenCalled();
    expect(outcome?.recovered).toBe(false);
    expect(outcome?.artifactExists).toBe(false);
    expect(outcome?.honest).toBe(false);
  });

  it("is reported dishonest when it claimed the chapter was done", async () => {
    const docs = store({ id: "existing-chapter-doc" });
    const outcome = await evaluateArtifactContract({
      ...base,
      workflowId: "revise",
      assistantText: "The revision is complete — chapter 7 is saved.",
      documentIds: [],
      documentService: docs,
    });
    expect(outcome?.honest).toBe(false);
    expect(outcome?.message).toBeTruthy();
  });

  it("leaves an ordinary in-progress turn alone", async () => {
    const docs = store(null);
    const outcome = await evaluateArtifactContract({
      ...base,
      assistantText: "Before I draft it — should the scene open at the harbour or the house?",
      documentIds: [],
      documentService: docs,
    });
    expect(outcome?.honest).toBe(true);
    expect(docs.create).not.toHaveBeenCalled();
  });
});

describe("paths that cannot tell a saved chapter from a lost one", () => {
  it("report nothing rather than guess", async () => {
    const docs = store(null);
    const outcome = await evaluateArtifactContract({
      ...base,
      assistantText: PROSE,
      documentIds: undefined, // the BullMQ worker / a delegation
      documentService: docs,
    });
    expect(outcome).toBeNull();
    expect(docs.create).not.toHaveBeenCalled();
  });

  it("report nothing for a chapter workflow with no chapter", async () => {
    const docs = store(null);
    const outcome = await evaluateArtifactContract({
      ...base,
      chapterNumber: undefined,
      assistantText: PROSE,
      documentIds: [],
      documentService: docs,
    });
    expect(outcome).toBeNull();
  });
});

describe("the chapter write itself", () => {
  it("is reported in the run's document ids", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const tools = readFileSync(
      join(__dirname, "..", "..", "src", "lib", "agents", "tools.ts"),
      "utf-8"
    );
    expect(tools).toContain("writtenChapterDocumentId");
    expect(tools).toContain("ctx.documentIds.push(writtenChapterDocumentId)");
  });
});
