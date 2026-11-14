// P2-69 (Wave 5 Task 7): ownership is hand-rolled inline in ~89 routes with no
// shared helper, so one forgotten `{ id, userId }` filter was caught by
// nothing. This sweep imports EVERY API route under a dynamic segment and
// calls each exported method as user u1 on ids that belong to someone else.
//
// The database is an adversary: a lookup that names the caller (userId /
// createdById / ownerId = "u1", at any depth) finds nothing, because the rows
// are not theirs; a lookup that does NOT name the caller finds a row owned by
// "intruder". A route must answer 400/403/404 and must not write anything (or
// touch storage, the vector store, the graph or a queue) unless the write
// itself is scoped to the caller.
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { NextRequest } from "next/server";

const CALLER = "u1";
const INTRUDER = "intruder";
const OWNER_KEYS = new Set(["userId", "createdById", "ownerId"]);

const h = vi.hoisted(() => ({ touched: [] as string[] }));

/** Does a Prisma `where` (at any depth) restrict the rows to the caller? */
function namesCaller(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    if (OWNER_KEYS.has(key)) {
      if (inner === CALLER) return true;
      if (inner && typeof inner === "object" && (inner as { equals?: unknown }).equals === CALLER) return true;
    }
    if (namesCaller(inner)) return true;
  }
  return false;
}

function foreignRow(args: { where?: Record<string, unknown> } | undefined): Record<string, unknown> {
  const id = typeof args?.where?.id === "string" ? args.where.id : "foreign-row";
  const owner = { id: "foreign-owner", userId: INTRUDER, createdById: INTRUDER };
  return {
    id,
    userId: INTRUDER,
    createdById: INTRUDER,
    ownerId: INTRUDER,
    bookId: "foreign-book",
    seriesId: "foreign-series",
    book: { ...owner, id: "foreign-book" },
    series: { ...owner, id: "foreign-series" },
    user: { id: INTRUDER },
  };
}

const READS = new Set(["findFirst", "findUnique", "findFirstOrThrow", "findUniqueOrThrow"]);
const WRITES = new Set(["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany"]);

function model(name: string) {
  return new Proxy(
    {},
    {
      get(_t, method: string) {
        return async (args?: { where?: Record<string, unknown> }) => {
          const mine = namesCaller(args?.where);
          if (READS.has(method)) {
            if (mine) {
              if (method.endsWith("OrThrow")) throw Object.assign(new Error("No record found"), { code: "P2025" });
              return null;
            }
            return foreignRow(args);
          }
          if (method === "findMany") return mine ? [] : [foreignRow(args)];
          if (method === "count") return 0;
          if (method === "aggregate") return { _sum: {}, _count: 0, _max: {}, _min: {} };
          if (method === "groupBy") return [];
          if (WRITES.has(method)) {
            if (!mine) h.touched.push(`db.${name}.${method}`);
            if (method.endsWith("Many")) return { count: 0 };
            if (mine && (method === "update" || method === "delete")) {
              throw Object.assign(new Error("Record to update not found."), { code: "P2025" });
            }
            return foreignRow(args);
          }
          return null;
        };
      },
    }
  );
}

const fakeDb: Record<string, unknown> = new Proxy(
  {},
  {
    get(_t, key: string) {
      if (key === "$transaction") {
        return async (arg: unknown) => (typeof arg === "function" ? arg(fakeDb) : Promise.all(arg as unknown[]));
      }
      if (key === "$queryRaw" || key === "$queryRawUnsafe") return async () => [];
      if (key === "$executeRaw" || key === "$executeRawUnsafe") {
        return async () => {
          h.touched.push(`db.${key}`);
          return 0;
        };
      }
      if (key === "then") return undefined;
      return model(key);
    },
  }
);

/** A module whose every export records that it was reached. */
function recorder(prefix: string) {
  const fn = (path: string): unknown =>
    new Proxy(function () {}, {
      get(_t, key: string) {
        if (key === "then") return undefined;
        return fn(`${path}.${key}`);
      },
      // Constructing a client at import (a BullMQ Queue) reaches nothing yet.
      construct() {
        return fn(`${path}#instance`) as object;
      },
      apply() {
        // Getting a client (getAppConnection, getBookStorage) reaches nothing;
        // what is called on it does.
        if (!/\.(?:get\w*(?:Connection|Storage|Client)|create\w*Connection)$/.test(path)) h.touched.push(path);
        return new Proxy(function () {}, {
          get(_t2, key: string) {
            if (key === "then") return undefined;
            return fn(`${path}().${key}`);
          },
          apply() {
            h.touched.push(`${path}()`);
            return null;
          },
        });
      },
    });
  return new Proxy({}, { get: (_t, key: string) => (key === "then" ? undefined : fn(`${prefix}.${key}`)), has: () => true });
}

vi.mock("@/lib/db", () => ({ db: fakeDb, default: fakeDb }));
vi.mock("@/lib/auth", () => ({
  requireUser: async () => ({ id: CALLER, clerkId: "clerk_u1", email: "u1@example.com", defaultModel: null }),
  getDbUser: async () => ({ id: CALLER, clerkId: "clerk_u1", email: "u1@example.com", defaultModel: null }),
}));
vi.mock("@/lib/storage", () => recorder("storage"));
vi.mock("@/lib/queue", () => recorder("queue"));
vi.mock("@/lib/queue/connection", () => recorder("redis"));
vi.mock("@/lib/queue/agent-queue", () => recorder("agentQueue"));
vi.mock("@/lib/vector/qdrant-client", () => recorder("qdrant"));
vi.mock("@/lib/graph/neo4j-client", () => recorder("neo4j"));
vi.mock("bullmq", () => recorder("bullmq"));
// Wave 7: export jobs are owner-checked in readOwnExportJob (export-jobs.test.ts);
// here no job exists for another writer's ids.
vi.mock("@/lib/queue/export-queue", () => ({
  readOwnExportJob: async () => null,
  enqueueExport: async () => {
    h.touched.push("exportQueue.enqueueExport");
    return { jobId: "j" };
  },
}));

const API = join(__dirname, "..", "..", "..", "src", "app", "api");

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return entry === "route.ts" && full.includes("[") ? [full] : [];
  });
}

/**
 * Routes that legitimately answer something other than a refusal here, each
 * with the reason. Keep this short; every entry is a route the sweep cannot
 * vouch for.
 */
const EXCEPTIONS: Record<string, string> = {
  // Public by design: the token is the capability (tested in routes/share-token).
  "share/[token]#GET": "public share link; a valid unexpired token is the capability",
  // An SSE response is always 200; its one event is SESSION_NOT_FOUND
  // (tests/unit/agent-stream-ordering.test.ts, "stream ownership").
  "books/[id]/agent/[sessionId]/stream#GET": "refuses inside the SSE stream, asserted in agent-stream-ordering",
};

/**
 * The first case of a shard pays the cold import of the route modules, which
 * passes vitest's 5 s default under a parallel run. The handler itself is still
 * raced against its own 5 s limit below.
 */
const CASE_TIMEOUT_MS = 20_000;

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
/** 405: the route exports the method only to say it is not allowed. */
const REFUSALS = new Set([400, 403, 404, 405]);
const refusedBy400: string[] = [];

const files = routeFiles(API).sort();

interface Case {
  route: string;
  method: (typeof METHODS)[number];
  file: string;
}

const cases: Case[] = [];
for (const file of files) {
  const route = relative(API, file).split(sep).slice(0, -1).join("/");
  // Discovered from the source text so the case list is known before import.
  const source = require("node:fs").readFileSync(file, "utf-8") as string;
  for (const method of METHODS) {
    if (new RegExp(`export (async )?function ${method}\\b|export const ${method}\\b`).test(source)) {
      cases.push({ route, method, file });
    }
  }
}

const UUID = "00000000-0000-4000-8000-000000000001";
const PAGE = { currentRoute: "/books/x" };

/**
 * A valid request for each route whose validation runs before its ownership
 * check, so the sweep reaches the check instead of stopping at a 400.
 */
const INPUTS: Record<string, { body?: unknown; query?: string; params?: Record<string, string> }> = {
  "books/[id]/agent/[sessionId]/approve#POST": { body: { approvalId: "a1", decision: "approve" } },
  "books/[id]/agent/[sessionId]/message#POST": { body: { message: "hello", pageContext: PAGE } },
  "books/[id]/agent#POST": { body: { workflowId: "write-chapter", pageContext: PAGE } },
  "books/[id]/archive#POST": { body: { archived: true } },
  "books/[id]/chapters/[chapterId]/content#PUT": { body: { markdown: "# One\n\nText." } },
  "books/[id]/chapters/reorder#PATCH": { body: { order: [{ chapterId: UUID, chapterNumber: 1 }] } },
  "books/[id]/chapters#POST": { body: { actNumber: 1, chapterNumber: 1, title: "One" } },
  "books/[id]/character-chat#POST": { body: { characterId: "c1", characterName: "Ana", message: "hi", history: [] } },
  "books/[id]/continuity/scan#POST": { query: "chapterNumber=1", body: {} },
  "books/[id]/cost-estimate#GET": { query: "workflowId=write-chapter" },
  "books/[id]/documents/[docId]/restore#POST": { body: { version: 1 } },
  "books/[id]/documents/[docId]#PATCH": { body: { content: "text" } },
  "books/[id]/documents/[docId]/versions/[version]#GET": { params: { version: "1" } },
  "books/[id]/documents#POST": { body: { type: "CONCEPT", content: "text" } },
  "books/[id]/editorial/findings/[findingId]/discuss#POST": { body: { writerMessage: "why?" } },
  "books/[id]/feedback#POST": { body: { suggestionId: "s1", suggestionType: "ghost", positive: true } },
  "books/[id]/ghost-text#POST": { body: { context: "She opened the", chapterNumber: 1 } },
  "books/[id]/inline-edit#POST": { body: { selectedText: "She opened the door." } },
  "books/[id]/polish-scene#POST": { body: { selectedText: "She opened the door." } },
  "books/[id]/search/replace#POST": { body: { find: "door", replace: "gate" } },
  "books/[id]/search#GET": { query: "q=door" },
  "books/[id]/series-context#GET": { query: "chapterNumber=1" },
  "books/[id]/structure/moves/[moveId]/decision#POST": { body: { decision: "accept" } },
  "memory/[id]#PATCH": { body: { content: "text" } },
  "series/[id]/agent#POST": { body: { workflowId: "series-bible", bookId: UUID } },
  "series/[id]/books/[bookId]/reorder#POST": { body: { newBookNumber: 2 } },
  "series/[id]/books#POST": { body: { bookId: UUID } },
  "series/[id]/documents/[docId]#PATCH": { body: { content: "text" } },
  "series/[id]/documents#POST": { body: { type: "SERIES_BIBLE", content: "text" } },
  "series/[id]/inherit#GET": { query: `bookId=${UUID}` },
  "series/[id]/inherit#POST": { body: { bookId: UUID } },
  "series/[id]/synthesize#GET": { query: "artifactType=STORY_BIBLE" },
  "series/[id]/synthesize#POST": { body: { bookId: UUID, bookNumber: 1, artifactType: "STORY_BIBLE" } },
};

function paramsFor(route: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const match of route.matchAll(/\[(?:\.\.\.)?(\w+)\]/g)) params[match[1]] = `foreign-${match[1]}`;
  if ("filename" in params) params.filename = "foreign.pdf";
  if ("token" in params) params.token = "f".repeat(48);
  return params;
}

beforeEach(() => {
  h.touched.length = 0;
});

describe("every id route refuses another writer's ids", () => {
  it("finds the routes", () => {
    expect(cases.length).toBeGreaterThan(80);
  });

  it.each(cases.map((c) => [`${c.route}#${c.method}`, c] as const))("%s", async (key, c) => {
    if (EXCEPTIONS[key]) return;
    const mod = await import(/* @vite-ignore */ c.file);
    const handler = mod[c.method] as (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
    const input = INPUTS[key] ?? {};
    const params = { ...paramsFor(c.route), ...input.params };
    const path = c.route.replace(/\[(?:\.\.\.)?(\w+)\]/g, (_m, p) => params[p]);
    const url = `http://test/api/${path}${input.query ? `?${input.query}` : ""}`;
    const req = new NextRequest(url, {
      method: c.method,
      ...(c.method === "GET" || c.method === "DELETE"
        ? {}
        : { headers: { "content-type": "application/json" }, body: JSON.stringify(input.body ?? {}) }),
    });
    const res = await Promise.race([
      handler(req, { params: Promise.resolve(params) }),
      new Promise<Response>((_, reject) => setTimeout(() => reject(new Error("route did not answer in 5 s")), 5000)),
    ]);
    if (res.status === 400) refusedBy400.push(`${key} ${JSON.stringify(await res.clone().json().catch(() => null)).slice(0, 120)}`);
    expect({ status: res.status, touched: [...h.touched] }, key).toEqual({
      status: REFUSALS.has(res.status) ? res.status : "a refusal (400/403/404/405)",
      touched: [],
    });
  }, CASE_TIMEOUT_MS);
});

afterAll(() => {
  // A 400 here may be body validation that ran before the ownership check, so
  // those cases do not exercise ownership; the list keeps that visible.
  console.info(`[ownership sweep] refused by 400 (validation first): ${refusedBy400.length}\n  ${refusedBy400.join("\n  ")}`);
});

/** Build the request for a case: its route params, query and body. */
function requestFor(c: Case, key: string, body: string | undefined) {
  const input = INPUTS[key] ?? {};
  const params = { ...paramsFor(c.route), ...input.params };
  const path = c.route.replace(/\[(?:\.\.\.)?(\w+)\]/g, (_m, p) => params[p]);
  const url = `http://test/api/${path}${input.query ? `?${input.query}` : ""}`;
  const req = new NextRequest(url, {
    method: c.method,
    ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body }),
  });
  return { req, params };
}

async function answer(c: Case, key: string, body: string): Promise<Response> {
  const mod = await import(/* @vite-ignore */ c.file);
  const handler = mod[c.method] as (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
  const { req, params } = requestFor(c, key, body);
  return Promise.race([
    handler(req, { params: Promise.resolve(params) }),
    new Promise<Response>((_, reject) => setTimeout(() => reject(new Error("route did not answer in 5 s")), 5000)),
  ]);
}

/** The same value with every leaf of the wrong type, so validation must refuse it. */
function wrongTypes(value: unknown): unknown {
  if (Array.isArray(value)) return "not-an-array";
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, wrongTypes(v)]));
  }
  if (typeof value === "string") return 12345;
  return "not-a-number-or-boolean";
}

// Raw ZodIssue keys (see zod-error-no-leak.test.ts): a 400 must carry only
// plain field/form messages.
const RAW_INTERNALS = /"code"\s*:\s*"(?:invalid_|too_|custom|unrecognized)|"expected"\s*:|"received"\s*:|"unionErrors"\s*:/;
const BODY_CASES = cases.filter((c) => c.method === "POST" || c.method === "PUT" || c.method === "PATCH");

describe("every id route with a body answers malformed JSON without a 500 (P2-69)", () => {
  it.each(BODY_CASES.map((c) => [`${c.route}#${c.method}`, c] as const))("%s", async (key, c) => {
    if (EXCEPTIONS[key]) return;
    const res = await answer(c, key, "{not json");
    expect({ status: res.status, touched: [...h.touched] }, key).toEqual({
      status: res.status === 400 || res.status === 404 || res.status === 403 ? res.status : "400 (or an ownership refusal)",
      touched: [],
    });
  }, CASE_TIMEOUT_MS);
});

describe("every id route keeps Zod internals out of its 400s (P2-69)", () => {
  const typed = BODY_CASES.filter((c) => INPUTS[`${c.route}#${c.method}`]?.body !== undefined);

  it("covers the routes that validate a body", () => {
    expect(typed.length).toBeGreaterThan(20);
  });

  it.each(typed.map((c) => [`${c.route}#${c.method}`, c] as const))("%s", async (key, c) => {
    const res = await answer(c, key, JSON.stringify(wrongTypes(INPUTS[key].body)));
    const text = await res.text();
    expect(res.status, `${key}: ${text.slice(0, 200)}`).toBeLessThan(500);
    expect(text, key).not.toMatch(RAW_INTERNALS);
    expect(h.touched, key).toEqual([]);
  }, CASE_TIMEOUT_MS);
});
