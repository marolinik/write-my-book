import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * D-199 — every document's FIRST version was badged "Manual", whatever wrote it.
 *
 * `DocumentService.create()` took a `changeSource` but had no `changeType`
 * parameter at all: it hardcoded `changeType: "manual_edit"`. `update()` does
 * take one, which is why the only honest `agent_write` rows in the database
 * came from agent UPDATES. Every created document — agent-written, imported,
 * transcript-recovered — was stamped as the writer's own manual edit.
 *
 * Live rows from the 50a capture (book 90436e20…):
 *
 *   | document          | change_type | change_source       | actual origin      |
 *   | STORY_BIBLE       | manual_edit | transcript-recovery | product recovered  |
 *   | FINGERPRINT       | manual_edit | agent               | the agent wrote it |
 *   | CHAPTER_CONTENT×8 | manual_edit | import              | bulk import        |
 *
 * Three provenances, one label. `change_source` carried the truth; the column
 * Version History actually renders (`version-history-panel.tsx`) did not.
 *
 * This matters here specifically: D-188's fix has the product own an agent's
 * unsaved artifact out loud and recover it. That honest recovery then landed in
 * the version log labelled as the writer's own manual edit — a smaller version
 * of the same untruth, on the audit surface.
 *
 * The two columns are DIFFERENT vocabularies and stay that way: `change_source`
 * says WHO initiated the write (user/agent/import/transcript-recovery/…),
 * `change_type` says WHAT KIND of change it was — the vocabulary the badge map
 * renders (agent_write → "AI", manual_edit → "Manual", revision → "Restore",
 * import → "Import"). `create()` now derives the second from the first when the
 * caller does not state it.
 */

const h = vi.hoisted(() => ({
  db: {
    document: { create: vi.fn(), findUnique: vi.fn() },
    documentVersion: { create: vi.fn() },
  },
  storage: { write: vi.fn(), read: vi.fn(), delete: vi.fn() },
  createVersion: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/storage", () => ({
  getBookStorage: () => h.storage,
  getSeriesStorage: () => h.storage,
}));
// update() versions through VersionManager (own transaction + CAS); only the
// provenance it is handed matters here.
vi.mock("@/lib/documents/version-manager", () => ({
  VersionManager: class {
    createVersion(...args: unknown[]) {
      h.createVersion(...args);
      return Promise.resolve({ version: 2 });
    }
  },
  VersionConflictError: class extends Error {},
}));

import { DocumentService } from "@/lib/documents/document-service";
import { changeTypeForSource } from "@/lib/documents/change-type";
import {
  evaluateArtifactContract,
  TRANSCRIPT_RECOVERY_SOURCE,
} from "@/lib/agents/artifact-contract";

/** `changeType` stamped on the initial version by the last create(). */
function stampedChangeType(): string | undefined {
  const call = h.db.documentVersion.create.mock.calls.at(-1) as
    | [{ data: { changeType?: string; changeSource?: string } }]
    | undefined;
  return call?.[0].data.changeType;
}

/** `changeSource` stamped on the initial version by the last create(). */
function stampedChangeSource(): string | undefined {
  const call = h.db.documentVersion.create.mock.calls.at(-1) as
    | [{ data: { changeType?: string; changeSource?: string } }]
    | undefined;
  return call?.[0].data.changeSource;
}

/** `changeType` handed to VersionManager by the last update(). */
function versionedChangeType(): string | undefined {
  return h.createVersion.mock.calls.at(-1)?.[1] as string | undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.db.document.create.mockResolvedValue({ id: "doc1" });
  h.db.documentVersion.create.mockResolvedValue({ id: "v1", version: 1 });
  h.db.document.findUnique.mockResolvedValue({
    id: "doc1",
    storageKey: "k",
    currentVersion: 1,
  });
  h.storage.write.mockResolvedValue(undefined);
});

describe("changeTypeForSource: source vocabulary → badge vocabulary", () => {
  it("human-initiated sources are manual edits", () => {
    // `user` is the service default; `manual` is what the editor hook sends;
    // both conflict-dialog steps are the writer's own words being saved.
    expect(changeTypeForSource("user")).toBe("manual_edit");
    expect(changeTypeForSource("manual")).toBe("manual_edit");
    expect(changeTypeForSource("conflict-backup")).toBe("manual_edit");
    expect(changeTypeForSource("conflict-resolve")).toBe("manual_edit");
  });

  it("an import is an import, not an AI write and not a manual edit", () => {
    // The badge map already has an `import` entry; nothing ever emitted it.
    expect(changeTypeForSource("import")).toBe("import");
  });

  it("a restore is a revision", () => {
    expect(changeTypeForSource("restore")).toBe("revision");
  });

  it("everything else — including recovery — is machine-written prose", () => {
    expect(changeTypeForSource("agent")).toBe("agent_write");
    expect(changeTypeForSource(TRANSCRIPT_RECOVERY_SOURCE)).toBe("agent_write");
    expect(changeTypeForSource("system")).toBe("agent_write");
    expect(changeTypeForSource("some-future-server-job")).toBe("agent_write");
  });
});

describe("D-199: DocumentService.create stamps the real provenance", () => {
  const svc = () => new DocumentService("u1", "b1");

  it("a writer's own document is still a manual edit (default source)", async () => {
    await svc().create("STORY_BIBLE" as never, "hand written");

    expect(stampedChangeType()).toBe("manual_edit");
    expect(stampedChangeSource()).toBe("user");
  });

  it("an agent-written document is badged AI, not Manual", async () => {
    // The live FINGERPRINT row: change_source `agent`, change_type `manual_edit`.
    await svc().create(
      "FINGERPRINT" as never,
      "voice analysis",
      "Fingerprint",
      undefined,
      undefined,
      "agent"
    );

    expect(stampedChangeType()).toBe("agent_write");
    expect(stampedChangeSource()).toBe("agent");
  });

  it("an imported chapter is badged Import, not Manual", async () => {
    // The live CHAPTER_CONTENT×8 rows.
    await svc().create(
      "CHAPTER_CONTENT" as never,
      "imported prose",
      "One",
      1,
      1,
      "import"
    );

    expect(stampedChangeType()).toBe("import");
    expect(stampedChangeSource()).toBe("import");
  });

  it("an explicit changeType wins over the derivation", async () => {
    await svc().create(
      "CHAPTER_CONTENT" as never,
      "restored prose",
      "One",
      1,
      1,
      "restore",
      "agent_write"
    );

    expect(stampedChangeType()).toBe("agent_write");
  });

  it("the two columns stay separate vocabularies", async () => {
    // change_source keeps the finer-grained truth the badge cannot express.
    await svc().create(
      "STORY_BIBLE" as never,
      "recovered",
      "Story Bible",
      undefined,
      undefined,
      TRANSCRIPT_RECOVERY_SOURCE
    );

    expect(stampedChangeType()).toBe("agent_write");
    expect(stampedChangeSource()).toBe(TRANSCRIPT_RECOVERY_SOURCE);
  });
});

describe("D-199: DocumentService.update derives the badge it was not given", () => {
  const svc = () => new DocumentService("u1", "b1");

  it("a bare update is still the writer's manual edit", async () => {
    await svc().update("doc1", "typed prose");

    expect(versionedChangeType()).toBe("manual_edit");
  });

  it("a stated source with no stated type is not badged Manual", async () => {
    // PATCH /documents/:id takes an OPTIONAL changeType next to a free-form
    // changeSource, so this combination is reachable from the API.
    await svc().update("doc1", "model prose", undefined, undefined, "agent");

    expect(versionedChangeType()).toBe("agent_write");
  });

  it("an import overwrite is badged Import", async () => {
    await svc().update("doc1", "imported prose", undefined, undefined, "import");

    expect(versionedChangeType()).toBe("import");
  });

  it("an explicit changeType still wins (the reclaim case)", async () => {
    // `orphan-reclaim` is a server-side label on the WRITER's own markdown —
    // the one source whose derivation would be wrong, so the caller states it.
    await svc().update(
      "doc1",
      "typed prose",
      undefined,
      "manual_edit",
      "orphan-reclaim"
    );

    expect(versionedChangeType()).toBe("manual_edit");
  });
});

describe("D-199 × D-188: the transcript-recovery write tells the truth", () => {
  it("a recovered Story Bible logs as an AI write from transcript-recovery", async () => {
    // The real service is used here on purpose: artifact-contract calls
    // create() POSITIONALLY with two undefined args, so this is the seam where
    // a signature change silently mis-stamps the recovery.
    const service = svc0();
    const outcome = await evaluateArtifactContract({
      workflowId: "create-story-bible",
      bookId: "b1",
      userId: "u1",
      assistantText: BIBLE,
      documentIds: [],
      documentService: service,
    });

    expect(outcome?.recovered).toBe(true);
    expect(stampedChangeType()).toBe("agent_write");
    expect(stampedChangeSource()).toBe(TRANSCRIPT_RECOVERY_SOURCE);
  });
});

/** Real service with the db/storage mocks above; findByType finds nothing. */
function svc0() {
  const service = new DocumentService("u1", "b1");
  vi.spyOn(service, "findByType").mockResolvedValue(null);
  return service;
}

/** A story-bible-shaped payload long and structured enough to be recoverable. */
const BIBLE = [
  "# Story Bible — Dead Reckoning",
  "",
  "## Characters",
  "| Name | Role | Arc |",
  "| --- | --- | --- |",
  "| Marek | protagonist | ledger-keeper who learns to trust |",
  "",
  "## World Rules",
  Array(220)
    .fill(
      "The harbour freezes by November and the customs office keeps two sets of books."
    )
    .join(" "),
  "",
  "**Story Bible Status:** Complete and ready for reference.",
].join("\n");
