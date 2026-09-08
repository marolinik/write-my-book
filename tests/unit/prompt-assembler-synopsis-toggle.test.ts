import { describe, it, expect, vi, beforeEach } from "vitest";

// prompt-assembler transitively imports @/lib/db (real Prisma init at load).
// Mock it so importing the module is side-effect free and we can toggle the
// per-book synopsisForLineEdit flag.
vi.mock("@/lib/db", () => ({
  db: {
    book: {
      findUnique: vi.fn(async () => ({ genre: "Fantasy" })),
    },
    bookSettings: {
      findUnique: vi.fn(),
    },
  },
}));

import { assembleAgentPrompt } from "@/lib/agents/prompt-assembler";
import { getAgentDefinition } from "@/lib/agents/definitions";
import type { AgentContext } from "@/lib/agents/types";
import { db } from "@/lib/db";

// Minimal DocumentService double returning a fixed SYNopsis for any read.
const synopsisText = "A hero begins a quest and faces a revelation.";
const makeDocService = (docTypes: Record<string, boolean> = {}) =>
  ({
    findByType: vi.fn(async (type: string) =>
      docTypes[type] ? { id: `doc-${type}`, type } : null
    ),
    read: vi.fn(async () => ({ content: synopsisText })),
    list: vi.fn(async () => []),
    create: vi.fn(),
    update: vi.fn(),
    write: vi.fn(),
    delete: vi.fn(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

const lineEditor = getAgentDefinition("line-editor")!;
const ghostwriter = getAgentDefinition("ghostwriter")!;

const baseContext = (bookId: string, agentType = "line-editor"): AgentContext =>
  ({ bookId, userId: "u1", sessionId: "s1", agentType }) as AgentContext;

describe("UDG-4: line-edit synopsis toggle (BookSettings.synopsisForLineEdit)", () => {
  beforeEach(() => {
    vi.mocked(db.bookSettings.findUnique).mockReset();
  });

  it("line-editor default (no setting row): NO story_synopsis injected (micro scope)", async () => {
    vi.mocked(db.bookSettings.findUnique).mockResolvedValue(null);
    const prompt = await assembleAgentPrompt(
      lineEditor,
      baseContext("book-le-off"),
      makeDocService({ SYNOPSIS: true })
    );
    expect(db.bookSettings.findUnique).toHaveBeenCalledWith({
      where: { bookId: "book-le-off" },
      select: { synopsisForLineEdit: true, lineEditorProfile: true },
    });
    expect(prompt).not.toContain("<story_synopsis>");
  });

  it("line-editor with synopsisForLineEdit=true: story_synopsis is loaded", async () => {
    vi.mocked(db.bookSettings.findUnique).mockResolvedValue({
      synopsisForLineEdit: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const prompt = await assembleAgentPrompt(
      lineEditor,
      baseContext("book-le-on"),
      makeDocService({ SYNOPSIS: true })
    );
    expect(prompt).toContain("<story_synopsis>");
    expect(prompt).toContain(synopsisText);
  });

  it("line-editor with synopsisForLineEdit=false: story_synopsis NOT loaded", async () => {
    vi.mocked(db.bookSettings.findUnique).mockResolvedValue({
      synopsisForLineEdit: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const prompt = await assembleAgentPrompt(
      lineEditor,
      baseContext("book-le-false"),
      makeDocService({ SYNOPSIS: true })
    );
    expect(prompt).not.toContain("<story_synopsis>");
  });

  it("a non-line-editor agent ignores the setting and uses its static profile (ghostwriter=full)", async () => {
    // Ghostwriter cannot be toggled off by the per-book flag; it always loads.
    const prompt = await assembleAgentPrompt(
      ghostwriter,
      baseContext("book-gw-on", "ghostwriter"),
      makeDocService({ SYNOPSIS: true })
    );
    expect(db.bookSettings.findUnique).not.toHaveBeenCalled(); // no line-editor branch
    expect(prompt).toContain("<story_synopsis>");
  });

  // ── UDG round-4 (Elena): per-line-editor profile templates ──
  it("developmental profile loads the synopsis even when the toggle is off", async () => {
    vi.mocked(db.bookSettings.findUnique).mockResolvedValue({
      synopsisForLineEdit: false,
      lineEditorProfile: "developmental",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const prompt = await assembleAgentPrompt(
      lineEditor,
      baseContext("book-dev"),
      makeDocService({ SYNOPSIS: true })
    );
    expect(prompt).toContain("<story_synopsis>");
    expect(prompt).toContain("<line_editor_profile>");
  });

  it("go_pub profile injects the profile block without forcing the synopsis", async () => {
    vi.mocked(db.bookSettings.findUnique).mockResolvedValue({
      synopsisForLineEdit: false,
      lineEditorProfile: "go_pub",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const prompt = await assembleAgentPrompt(
      lineEditor,
      baseContext("book-gopub"),
      makeDocService({ SYNOPSIS: true })
    );
    expect(prompt).not.toContain("<story_synopsis>");
    expect(prompt).toContain("<line_editor_profile>");
  });

  it("standard profile adds neither synopsis (if toggle off) nor a profile block", async () => {
    vi.mocked(db.bookSettings.findUnique).mockResolvedValue({
      synopsisForLineEdit: false,
      lineEditorProfile: "standard",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const prompt = await assembleAgentPrompt(
      lineEditor,
      baseContext("book-std"),
      makeDocService({ SYNOPSIS: true })
    );
    expect(prompt).not.toContain("<story_synopsis>");
    expect(prompt).not.toContain("<line_editor_profile>");
  });
});