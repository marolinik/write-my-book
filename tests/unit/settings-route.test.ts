// tests/unit/settings-route.test.ts
// D-35 (P6 Owen C-1): the setup wizard's "Finish Setup" PATCHes
// {setupComplete: true} to /api/books/:id/settings, but the key was missing
// from updateSettingsSchema — Zod silently stripped it, the upsert no-oped,
// and the route returned 200 while the flag stayed false. SETUP-07 then
// 422-walled every non-setup workflow for paste-in writers.
// The PATCH route is generic (schema.parse → upsert), so the schema IS the
// contract; these tests pin schema, route persistence, and the SETUP-07 gate.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { updateSettingsSchema } from "@/lib/validation";

const h = vi.hoisted(() => ({
  user: { id: "u1" },
  requireUser: vi.fn(),
  db: {
    book: { findFirst: vi.fn() },
    bookSettings: { upsert: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    document: { findMany: vi.fn() },
    chapter: { count: vi.fn() },
  },
  checkQuota: vi.fn(),
  getWorkflow: vi.fn(),
  getAgentDefinition: vi.fn(),
  validatePrerequisites: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
// Seams the agent route imports at module scope (only the ones reached
// before/at the SETUP-07 gate are given behavior).
vi.mock("@/lib/encryption", () => ({ decryptApiKey: vi.fn() }));
vi.mock("@/lib/llm/cost-estimator", () => ({ estimateWorkflowCost: vi.fn() }));
vi.mock("@/lib/llm/price-validator", () => ({ validatePrices: vi.fn() }));
vi.mock("@/lib/billing/quota-checker", () => ({
  checkQuota: (...args: unknown[]) => h.checkQuota(...args),
}));
vi.mock("@/lib/llm", () => ({
  resolveModelForRole: vi.fn(),
  resolveConductorModel: vi.fn(),
  meetsMinimumTier: vi.fn(),
  mapAgentTypeToRole: vi.fn(),
  resolveProviderRoute: vi.fn(),
  validateApiKey: vi.fn(),
}));
vi.mock("@anthropic-ai/sdk", () => ({ default: class {} }));
vi.mock("@/lib/agents", () => ({
  AgentOrchestrator: class {},
  getWorkflow: (...args: unknown[]) => h.getWorkflow(...args),
  getAgentDefinition: (...args: unknown[]) => h.getAgentDefinition(...args),
  createSession: vi.fn(),
  pushMessage: vi.fn(),
  completeSession: vi.fn(),
  validatePrerequisites: (...args: unknown[]) => h.validatePrerequisites(...args),
  addUserMessage: vi.fn(),
  addAssistantMessage: vi.fn(),
  processPostSession: vi.fn(),
}));
vi.mock("@/lib/queue", () => ({ enqueueAgentJob: vi.fn() }));

import { PATCH } from "@/app/api/books/[id]/settings/route";
import { POST as agentPOST } from "@/app/api/books/[id]/agent/route";

const ctx = { params: Promise.resolve({ id: "b1" }) };

function patchReq(body: unknown) {
  return new Request("http://t/api/books/b1/settings", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

function agentReq(body: unknown) {
  return new Request("http://t/api/books/b1/agent", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue(h.user);
  h.db.book.findFirst.mockResolvedValue({ id: "b1", userId: "u1" });
  h.db.bookSettings.upsert.mockImplementation(
    async ({ update }: { update: Record<string, unknown> }) => ({
      bookId: "b1",
      ...update,
    })
  );
});

// ─── Schema contract (the wizard's exact payloads) ───────────────

describe("updateSettingsSchema — setup wizard flags (D-35)", () => {
  it("accepts setupComplete: true (Finish Setup payload)", () => {
    const parsed = updateSettingsSchema.parse({ setupComplete: true });
    expect(parsed.setupComplete).toBe(true);
  });

  it("accepts setupComplete: false (symmetric unset)", () => {
    const parsed = updateSettingsSchema.parse({ setupComplete: false });
    expect(parsed.setupComplete).toBe(false);
  });

  it("accepts setupImportSkipped: true/false (Skip Import payload)", () => {
    expect(
      updateSettingsSchema.parse({ setupImportSkipped: true }).setupImportSkipped
    ).toBe(true);
    expect(
      updateSettingsSchema.parse({ setupImportSkipped: false }).setupImportSkipped
    ).toBe(false);
  });

  it("rejects non-boolean setupComplete (no coercion on a JSON body)", () => {
    expect(() => updateSettingsSchema.parse({ setupComplete: "true" })).toThrow();
    expect(() => updateSettingsSchema.parse({ setupComplete: 1 })).toThrow();
    expect(() => updateSettingsSchema.parse({ setupComplete: null })).toThrow();
  });

  it("rejects non-boolean setupImportSkipped", () => {
    expect(() =>
      updateSettingsSchema.parse({ setupImportSkipped: "yes" })
    ).toThrow();
  });

  it("is optional — absent keys stay absent (no accidental overwrite)", () => {
    const parsed = updateSettingsSchema.parse({ autoCommit: true });
    expect(parsed.setupComplete).toBeUndefined();
    expect(parsed.setupImportSkipped).toBeUndefined();
    expect(parsed.autoCommit).toBe(true);
  });

  it("rejects unknown keys instead of silently stripping them (D-39 strict)", () => {
    // Pre-D-39 this stripped `someUnknownKey` and returned the parsed object;
    // now the schema is .strict() so an unknown key is a hard validation error.
    expect(() =>
      updateSettingsSchema.parse({ setupComplete: true, someUnknownKey: "x" })
    ).toThrow();
  });
});

// ─── Route persistence ───────────────────────────────────────────

describe("PATCH /api/books/:id/settings — persists wizard flags (D-35)", () => {
  it("PATCH {setupComplete: true} → 200 and the flag reaches the upsert", async () => {
    const res = await PATCH(patchReq({ setupComplete: true }) as never, ctx as never);
    expect(res.status).toBe(200);
    const call = h.db.bookSettings.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ bookId: "b1" });
    expect(call.update).toEqual({ setupComplete: true });
    expect(call.create).toEqual({ bookId: "b1", setupComplete: true });
    await expect(res.json()).resolves.toMatchObject({ setupComplete: true });
  });

  it("PATCH {setupComplete: false} → unset persists too (symmetric)", async () => {
    const res = await PATCH(patchReq({ setupComplete: false }) as never, ctx as never);
    expect(res.status).toBe(200);
    expect(h.db.bookSettings.upsert.mock.calls[0][0].update).toEqual({
      setupComplete: false,
    });
  });

  it("PATCH {setupImportSkipped: true} → persists (Skip Import step)", async () => {
    const res = await PATCH(
      patchReq({ setupImportSkipped: true }) as never,
      ctx as never
    );
    expect(res.status).toBe(200);
    expect(h.db.bookSettings.upsert.mock.calls[0][0].update).toEqual({
      setupImportSkipped: true,
    });
  });

  it("PATCH {setupComplete: 'yes'} → 400, nothing persisted", async () => {
    const res = await PATCH(patchReq({ setupComplete: "yes" }) as never, ctx as never);
    expect(res.status).toBe(400);
    expect(h.db.bookSettings.upsert).not.toHaveBeenCalled();
  });

  it("unknown keys now 400 (D-39 strict), nothing persisted", async () => {
    const res = await PATCH(
      patchReq({ setupComplete: true, someUnknownKey: "x" }) as never,
      ctx as never
    );
    expect(res.status).toBe(400);
    expect(h.db.bookSettings.upsert).not.toHaveBeenCalled();
  });
});

// ─── Downstream: the SETUP-07 wall the flag exists to open ───────

describe("SETUP-07 gate honors settings.setupComplete (D-35 downstream)", () => {
  beforeEach(() => {
    h.getWorkflow.mockReturnValue({ id: "line-edit", category: "editing" });
    h.getAgentDefinition.mockReturnValue({ type: "writing-coach" });
    h.validatePrerequisites.mockResolvedValue({ satisfied: true, missing: [] });
    // Stop the route right after the gate: quota denial → 429.
    h.checkQuota.mockResolvedValue({ allowed: false, reason: "quota-stop" });
  });

  it("setupComplete: true passes the gate without demanding bible/architecture docs", async () => {
    h.db.book.findFirst.mockResolvedValue({
      id: "b1",
      userId: "u1",
      settings: { setupComplete: true },
    });
    const res = await agentPOST(
      agentReq({ workflowId: "line-edit" }) as never,
      ctx as never
    );
    expect(res.status).toBe(429); // past the 422 wall, stopped at quota stub
    expect(h.db.document.findMany).not.toHaveBeenCalled();
  });

  it("setupComplete: false with no docs still 422-walls non-setup workflows", async () => {
    h.db.book.findFirst.mockResolvedValue({
      id: "b1",
      userId: "u1",
      settings: { setupComplete: false },
    });
    h.db.document.findMany.mockResolvedValue([]);
    h.db.chapter.count.mockResolvedValue(0);
    const res = await agentPOST(
      agentReq({ workflowId: "line-edit" }) as never,
      ctx as never
    );
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({
      setupIncomplete: true,
      redirectTo: "/books/b1/setup",
    });
  });
});
