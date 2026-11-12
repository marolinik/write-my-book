// Wave 6 Task 2 (P2-1, P2-9, P2-24, P2-25, P2-26): error envelopes are honest
// on EVERY route, not only the ones with an id segment.
//
// 1. No session: requireUser throws UnauthorizedError and getDbUser returns
//    null. Every non-public route must answer 401, never a 500 "Unauthorized"
//    (the client only redirects to sign-in on 401).
// 2. Everything behind the route fails: each database, storage, queue and
//    store call throws an error whose message carries a database URL and a
//    temp path. No route may echo that text in its response body.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { NextRequest } from "next/server";

const SENTINEL = "SENTINEL_LEAK postgres://db-internal:5432/wmb /tmp/wmb-export-secret";

const h = vi.hoisted(() => ({ mode: "anon" as "anon" | "boom" }));

const USER = { id: "u1", clerkId: "clerk_u1", email: "u1@example.com", defaultModel: null };

function failing(): unknown {
  const fn: unknown = new Proxy(function () {}, {
    get(_t, key: string) {
      if (key === "then") return undefined;
      return failing();
    },
    apply() {
      if (h.mode === "boom") throw new Error(SENTINEL);
      return failing();
    },
    construct() {
      return failing() as object;
    },
  });
  return fn;
}

function failingModule() {
  return new Proxy({}, { get: (_t, key: string) => (key === "then" ? undefined : failing()), has: () => true });
}

const fakeDb = new Proxy(
  {},
  {
    get(_t, key: string) {
      if (key === "then") return undefined;
      return new Proxy(
        async () => {
          throw new Error(SENTINEL);
        },
        {
          get(_t2, method: string) {
            if (method === "then") return undefined;
            return async () => {
              if (h.mode === "anon") return null;
              throw new Error(SENTINEL);
            };
          },
        }
      );
    },
  }
);

vi.mock("@/lib/db", () => ({ db: fakeDb, default: fakeDb }));
vi.mock("@/lib/auth", async () => {
  const { UnauthorizedError } = await vi.importActual<typeof import("@/lib/auth/errors")>("@/lib/auth/errors");
  return {
    requireUser: async () => {
      if (h.mode === "anon") throw new UnauthorizedError();
      return USER;
    },
    getDbUser: async () => (h.mode === "anon" ? null : USER),
  };
});
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: h.mode === "anon" ? null : "clerk_u1" }),
  currentUser: async () => null,
  clerkClient: async () => failing(),
}));
vi.mock("@/lib/storage", () => failingModule());
vi.mock("@/lib/queue", () => failingModule());
vi.mock("@/lib/queue/connection", () => failingModule());
vi.mock("@/lib/queue/agent-queue", () => failingModule());
vi.mock("@/lib/vector/qdrant-client", () => failingModule());
vi.mock("@/lib/graph/neo4j-client", () => failingModule());
vi.mock("bullmq", () => failingModule());

const API = join(__dirname, "..", "..", "..", "src", "app", "api");

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return entry === "route.ts" ? [full] : [];
  });
}

/** Public by design (the middleware lets them through without a user). */
const PUBLIC = [/^auth\/webhook$/, /^billing\/webhook$/, /^billing\/founder-count$/, /^health(\/|$)/, /^share(\/|$)/];

/**
 * Signed-in routes that may answer something other than 401 to an anonymous
 * caller, each with its reason.
 */
const NOT_401: Record<string, string> = {
  "billing/checkout#POST": "503 when Stripe is not configured, before any user is involved (true for every caller)",
  "billing/portal#POST": "503 when Stripe is not configured, before any user is involved (true for every caller)",
  "series/[id]/books#GET": "405: the method is exported only to say it is not allowed",
};

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
const UUID = "00000000-0000-4000-8000-000000000001";
const CASE_TIMEOUT_MS = 20_000;

interface Case {
  route: string;
  method: (typeof METHODS)[number];
  file: string;
}

const cases: Case[] = [];
for (const file of routeFiles(API).sort()) {
  const route = relative(API, file).split(sep).slice(0, -1).join("/");
  const source = readFileSync(file, "utf-8");
  for (const method of METHODS) {
    if (new RegExp(`export (async )?function ${method}\\b|export const ${method}\\b`).test(source)) {
      cases.push({ route, method, file });
    }
  }
}

function paramsFor(route: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const match of route.matchAll(/\[(?:\.\.\.)?(\w+)\]/g)) params[match[1]] = UUID;
  if ("filename" in params) params.filename = "export.pdf";
  if ("token" in params) params.token = "f".repeat(48);
  if ("version" in params) params.version = "1";
  return params;
}

async function call(c: Case): Promise<Response> {
  const mod = await import(/* @vite-ignore */ c.file);
  const handler = mod[c.method] as (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
  const params = paramsFor(c.route);
  const path = c.route.replace(/\[(?:\.\.\.)?(\w+)\]/g, (_m, p) => params[p]);
  // A public caller behind the proxy (never the loopback orchestrator).
  const headers: Record<string, string> = { host: "app.example", "x-forwarded-for": "203.0.113.9" };
  const req = new NextRequest(`http://app.example/api/${path}`, {
    method: c.method,
    ...(c.method === "GET" || c.method === "DELETE"
      ? { headers }
      : { headers: { ...headers, "content-type": "application/json" }, body: "{}" }),
  });
  return Promise.race([
    handler(req, { params: Promise.resolve(params) }),
    new Promise<Response>((_, reject) => setTimeout(() => reject(new Error("route did not answer in 5 s")), 5000)),
  ]);
}

/** The body as text; an SSE stream is read for its first events only. */
async function bodyText(res: Response): Promise<string> {
  if (!(res.headers.get("content-type") ?? "").includes("text/event-stream") || !res.body) {
    return res.text();
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  const deadline = Date.now() + 1500;
  while (Date.now() < deadline) {
    const next = await Promise.race([
      reader.read(),
      new Promise<{ done: true; value: undefined }>((r) => setTimeout(() => r({ done: true, value: undefined }), 300)),
    ]);
    if (next.done) break;
    text += decoder.decode(next.value);
  }
  await reader.cancel().catch(() => {});
  return text;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("every signed-in route answers 401 without a session (P2-1, P2-9, P2-24)", () => {
  const signedIn = cases.filter((c) => !PUBLIC.some((p) => p.test(c.route)));

  it("finds the routes", () => {
    expect(signedIn.length).toBeGreaterThan(150);
  });

  it.each(signedIn.map((c) => [`${c.route}#${c.method}`, c] as const))(
    "%s",
    async (key, c) => {
      h.mode = "anon";
      if (NOT_401[key]) return;
      const res = await call(c);
      const text = await bodyText(res);
      expect({ status: res.status }, `${key}: ${text.slice(0, 160)}`).toEqual({ status: 401 });
    },
    CASE_TIMEOUT_MS
  );
});

describe("no route echoes an internal error message (P2-8, P2-9, P2-24, P2-25, P2-26)", () => {
  it.each(cases.map((c) => [`${c.route}#${c.method}`, c] as const))(
    "%s",
    async (key, c) => {
      h.mode = "boom";
      const res = await call(c).catch((error: unknown) => {
        // A route that lets the error escape is answered by Next's own generic 500.
        expect(String(error)).toContain("SENTINEL_LEAK");
        return new Response("", { status: 500 });
      });
      const text = await bodyText(res);
      expect(text, `${key} (${res.status})`).not.toContain("SENTINEL_LEAK");
      expect(text, key).not.toContain("db-internal");
      // A database outage is not a sign-out: a 401 would loop the writer through /login.
      expect(res.status, `${key}: an outage answered as 401`).not.toBe(401);
    },
    CASE_TIMEOUT_MS
  );
});
