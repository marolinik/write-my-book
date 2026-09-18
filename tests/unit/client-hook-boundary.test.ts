/**
 * Guard against a React hook being reachable from a server-rendered module.
 *
 * A hook only works inside a client component. Put one where Next renders on
 * the server and nothing fails at build time — it throws at request time,
 * inside an error boundary, so the writer gets "Nešto je pošlo naopako" and no
 * clue what broke.
 *
 * D-206 was exactly that: the i18n sweep gave the shelf card's PrimaryCta a
 * `useLanguage()` call and /books went blank for every writer. The whole book
 * list is server rendered, so the fix was to pass the strings in as props.
 *
 * "use client" marks a BOUNDARY, not a file: a helper with no directive that is
 * only ever imported by client components is perfectly fine, which is why this
 * walks the import graph from the server entry points and stops at the first
 * client module rather than flagging every file that mentions a hook.
 */

import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = join(__dirname, "..", "..");
const SRC = join(ROOT, "src");
const SKIP_DIRS = new Set(["generated", "node_modules", ".next"]);

/** Hooks that cannot run on the server. */
const CLIENT_ONLY_HOOKS = [
  "useLanguage",
  "useState",
  "useEffect",
  "useRouter",
  "useReducer",
  "useContext",
];

/** App-router files Next renders on the server unless they say otherwise. */
const SERVER_ENTRIES = /[/\\](page|layout|template|default|route)\.tsx?$/;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(entry)) out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * True when the module opens with the "use client" directive. The directive
 * must precede every statement, but comments and blank lines may come first,
 * so strip those before looking.
 */
function isClientModule(source: string): boolean {
  const body = source
    .replace(/^﻿/, "")
    .replace(/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*/, "")
    .trimStart();
  return body.startsWith('"use client"') || body.startsWith("'use client'");
}

/**
 * Strips comments so a hook named in prose — including the note explaining why
 * a component stopped calling one — is not mistaken for a call.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
}

/** Every module specifier this file imports or re-exports from. */
function importedSpecifiers(source: string): string[] {
  const out: string[] = [];
  const patterns = [
    /\bfrom\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) out.push(match[1]);
  }
  return out;
}

/** Resolves an in-repo specifier to a file path, or null for a package. */
function resolveSpecifier(specifier: string, fromFile: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) {
    base = join(SRC, specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    base = resolve(dirname(fromFile), specifier);
  } else {
    return null;
  }

  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

describe("client/server component boundary", () => {
  const files = sourceFiles(SRC);
  const source = new Map(files.map((f) => [f, readFileSync(f, "utf-8")]));
  const client = new Map(
    files.map((f) => [f, isClientModule(source.get(f) ?? "")])
  );

  /**
   * Walks out from every server entry, refusing to cross into a client module:
   * everything a client component imports is client code by definition.
   */
  function serverReachable(): Set<string> {
    const seen = new Set<string>();
    const queue = files.filter(
      (f) => SERVER_ENTRIES.test(f) && !client.get(f)
    );

    while (queue.length > 0) {
      const file = queue.pop() as string;
      if (seen.has(file)) continue;
      seen.add(file);

      for (const specifier of importedSpecifiers(source.get(file) ?? "")) {
        const target = resolveSpecifier(specifier, file);
        if (!target || seen.has(target) || client.get(target)) continue;
        queue.push(target);
      }
    }

    return seen;
  }

  const reachable = serverReachable();

  it("finds the server-rendered modules", () => {
    expect(reachable.size).toBeGreaterThan(50);
  });

  for (const hook of CLIENT_ONLY_HOOKS) {
    it(`never calls ${hook}() from a server-reachable module`, () => {
      const called = new RegExp(`\\b${hook}\\s*\\(`);
      const offenders = [...reachable]
        .filter((file) => called.test(stripComments(source.get(file) ?? "")))
        .map((file) => relative(ROOT, file).replace(/\\/g, "/"))
        .sort();

      expect(offenders).toEqual([]);
    });
  }
});
