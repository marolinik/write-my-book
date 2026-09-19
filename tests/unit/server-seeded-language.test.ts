/**
 * The interface language is resolved before the first paint.
 *
 * It lived only in a client query, so every page load rendered its chrome in
 * English and swapped to the writer's language once
 * `GET /api/settings/language` came back — a visible flash on every
 * navigation. `<html lang>` was hardcoded "en" too, so the browser spellchecked
 * Serbian prose as English and a screen reader announced it with an English
 * voice.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const h = vi.hoisted(() => ({ getDbUser: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getDbUser: h.getDbUser }));

import { getServerLanguage, getServerLocaleTag } from "@/lib/i18n/server-language";

const src = (...p: string[]) => readFileSync(join(__dirname, "..", "..", "src", ...p), "utf-8");

describe("the server's answer for the interface language", () => {
  beforeEach(() => {
    h.getDbUser.mockReset();
    h.getDbUser.mockImplementation(async () => null);
  });

  it("is the writer's own preference", async () => {
    h.getDbUser.mockResolvedValue({ preferredLanguage: "sr" });
    expect(await getServerLanguage()).toBe("sr");
  });

  it("is a BCP-47 tag for <html lang>, Latin script for Serbian", async () => {
    h.getDbUser.mockResolvedValue({ preferredLanguage: "sr" });
    expect(await getServerLocaleTag()).toBe("sr-Latn-RS");
  });

  it("refuses a language the UI cannot actually render", async () => {
    h.getDbUser.mockResolvedValue({ preferredLanguage: "ja" });
    expect(await getServerLanguage()).toBe("en");
  });

  it("answers English before sign-in rather than failing the page", async () => {
    h.getDbUser.mockResolvedValue(null);
    expect(await getServerLanguage()).toBe("en");
  });

  it("answers English when the database is unreachable", async () => {
    h.getDbUser.mockImplementation(() => Promise.reject(new Error("db down")));
    await expect(getServerLanguage()).resolves.toBe("en");
  });
});

describe("the layouts use it", () => {
  it("the root layout drives <html lang> from the writer", () => {
    const layout = src("app", "layout.tsx");
    expect(layout).toMatch(/const localeTag = await getServerLocaleTag\(\)/);
    expect(layout).toMatch(/<html lang=\{localeTag\}/);
    expect(layout).not.toMatch(/<html lang="en"/);
  });

  it("the app layout seeds the provider on the server", () => {
    const layout = src("app", "(app)", "layout.tsx");
    expect(layout).toMatch(/const initialLanguage = await getServerLanguage\(\)/);
    expect(layout).toMatch(/<AppShell initialLanguage=\{initialLanguage\}>/);
    // The shell stays a client component; only the language resolution moved.
    expect(src("app", "(app)", "app-shell.tsx")).toMatch(/^"use client";/);
  });
});
