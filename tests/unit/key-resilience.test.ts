/**
 * Wave 6 Task 1 (P2-17, P2-20, P2-21, P2-45): stored keys cannot take the
 * product down. Derivation is paid once per secret, ciphertexts carry a
 * version, a rotated secret still opens old rows, one undecryptable row is
 * skipped instead of 500-ing every AI route, and production refuses the
 * public dev passwords for Neo4j and Qdrant.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { apiKey: { findMany: h.findMany } } }));

import { decryptApiKey, encryptApiKey, maskStoredKey } from "@/lib/encryption";
import { decryptValidatedKeys } from "@/lib/llm/decrypt-validated-keys";
import { validateEnv } from "@/lib/env";

const SECRET_A = "secret-a-0123456789abcdef0123456789abcdef";
const SECRET_B = "secret-b-0123456789abcdef0123456789abcdef";

function legacyEncrypt(plaintext: string, secret: string): string {
  const key = crypto.scryptSync(secret, "wmb-salt", 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let enc = cipher.update(plaintext, "utf8", "hex");
  enc += cipher.final("hex");
  return `${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${enc}`;
}

const saved = { ...process.env };
beforeEach(() => {
  process.env.API_KEY_ENCRYPTION_SECRET = SECRET_A;
  delete process.env.API_KEY_ENCRYPTION_SECRET_PREVIOUS;
  h.findMany.mockReset();
});
afterEach(() => {
  process.env = { ...saved };
  vi.restoreAllMocks();
});

describe("encryption", () => {
  it("derives the key once per secret: 100 decrypts take well under a second", () => {
    const enc = encryptApiKey("sk-test-1234567890");
    const start = performance.now();
    for (let i = 0; i < 100; i++) decryptApiKey(enc);
    expect(performance.now() - start).toBeLessThan(500);
  });

  it("writes a versioned ciphertext and still reads the legacy format", () => {
    const enc = encryptApiKey("sk-new");
    expect(enc.startsWith("v1:")).toBe(true);
    expect(decryptApiKey(enc)).toBe("sk-new");
    expect(decryptApiKey(legacyEncrypt("sk-old", SECRET_A))).toBe("sk-old");
  });

  it("opens rows written under the previous secret after a rotation", () => {
    const v1 = encryptApiKey("sk-rotated");
    const legacy = legacyEncrypt("sk-legacy", SECRET_A);
    process.env.API_KEY_ENCRYPTION_SECRET = SECRET_B;
    process.env.API_KEY_ENCRYPTION_SECRET_PREVIOUS = SECRET_A;
    expect(decryptApiKey(v1)).toBe("sk-rotated");
    expect(decryptApiKey(legacy)).toBe("sk-legacy");
  });

  it("still refuses a row neither secret opens", () => {
    const enc = encryptApiKey("sk-x");
    process.env.API_KEY_ENCRYPTION_SECRET = SECRET_B;
    expect(() => decryptApiKey(enc)).toThrow();
  });

  it("maskStoredKey flags an undecryptable row for re-entry instead of throwing", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(maskStoredKey(encryptApiKey("sk-ant-abcdefghijkl"))).toEqual({
      maskedKey: "sk-ant-...ijkl",
      needsReentry: false,
    });
    expect(maskStoredKey("garbage")).toEqual({ maskedKey: null, needsReentry: true });
  });
});

describe("decryptValidatedKeys", () => {
  it("skips and logs a bad row and keeps the good ones", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    h.findMany.mockResolvedValue([
      { provider: "anthropic", encryptedKey: "not:a:key" },
      { provider: "openrouter", encryptedKey: encryptApiKey("sk-or-good") },
    ]);
    const keys = await decryptValidatedKeys("u1");
    expect(keys).toEqual({ openrouter: "sk-or-good" });
    expect(log).toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain("sk-or-good");
    expect(h.findMany.mock.calls[0][0].where).toEqual({
      userId: "u1",
      validatedAt: { not: null },
    });
  });
});

describe("no route decrypts inline", () => {
  it("src/app/api never calls decryptApiKey directly", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(e.name) && /decryptApiKey\(/.test(fs.readFileSync(p, "utf8"))) {
          offenders.push(path.relative(process.cwd(), p));
        }
      }
    };
    walk(path.join(process.cwd(), "src/app/api"));
    expect(offenders).toEqual([]);
  });

  it.each(["src/lib/llm/ghostwriter-client.ts", "src/lib/editorial/discuss-llm.ts"])(
    "%s uses the shared helper",
    (file) => {
      expect(fs.readFileSync(file, "utf8")).not.toMatch(/decryptApiKey\(/);
    }
  );
});

describe("production store secrets", () => {
  function prodEnv(extra: Record<string, string | undefined>) {
    process.env = { ...saved, NODE_ENV: "production", CI: "false", ...extra } as NodeJS.ProcessEnv;
    return validateEnv("worker").issues.filter((i) => i.severity === "error").map((i) => i.key);
  }

  it("requires NEO4J_PASSWORD when NEO4J_URI is set", () => {
    expect(prodEnv({ NEO4J_URI: "bolt://neo4j:7687", NEO4J_PASSWORD: undefined })).toContain("NEO4J_PASSWORD");
  });

  it("refuses the public dev passwords", () => {
    const errs = prodEnv({
      NEO4J_URI: "bolt://neo4j:7687",
      NEO4J_PASSWORD: "wmb-neo4j-dev",
      QDRANT_URL: "http://qdrant:6333",
      QDRANT_API_KEY: "wmb-qdrant-prod",
    });
    expect(errs).toEqual(expect.arrayContaining(["NEO4J_PASSWORD", "QDRANT_API_KEY"]));
  });

  it("accepts real values", () => {
    const errs = prodEnv({
      NEO4J_URI: "bolt://neo4j:7687",
      NEO4J_PASSWORD: "a-real-long-password",
      QDRANT_URL: "http://qdrant:6333",
      QDRANT_API_KEY: "a-real-qdrant-key",
    });
    expect(errs).not.toContain("NEO4J_PASSWORD");
    expect(errs).not.toContain("QDRANT_API_KEY");
  });

  it("the Neo4j client has no dev-password fallback in production", () => {
    const src = fs.readFileSync("src/lib/graph/neo4j-client.ts", "utf8");
    expect(src).not.toMatch(/NEO4J_PASSWORD \?\? "wmb-neo4j-dev"/);
  });
});
