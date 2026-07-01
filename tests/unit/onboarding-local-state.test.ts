// tests/unit/onboarding-local-state.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getOnboardingState, addDismissed, addToasted } from "@/lib/onboarding/local-state";

const store = new Map<string, string>();
function installLocalStorage() {
  (globalThis as unknown as { window: unknown }).window = globalThis;
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
}
function uninstallLocalStorage() {
  delete (globalThis as Record<string, unknown>).window;
  delete (globalThis as Record<string, unknown>).localStorage;
}

describe("onboarding local-state", () => {
  beforeEach(() => { store.clear(); installLocalStorage(); });
  afterEach(() => uninstallLocalStorage());

  it("returns empty sets when nothing stored", () => {
    const s = getOnboardingState("book1");
    expect(s.dismissed.size).toBe(0);
    expect(s.toasted.size).toBe(0);
  });

  it("round-trips dismissed and toasted independently, per book", () => {
    addDismissed("book1", "capture-style");
    addToasted("book1", "build-architecture");
    const s = getOnboardingState("book1");
    expect([...s.dismissed]).toEqual(["capture-style"]);
    expect([...s.toasted]).toEqual(["build-architecture"]);
    expect(getOnboardingState("book2").dismissed.size).toBe(0);
  });

  it("add is idempotent", () => {
    addDismissed("book1", "capture-style");
    addDismissed("book1", "capture-style");
    expect([...getOnboardingState("book1").dismissed]).toEqual(["capture-style"]);
  });

  it("corrupted JSON degrades to empty set", () => {
    store.set("wmb:onboard-dismissed:book1", "{not json");
    expect(getOnboardingState("book1").dismissed.size).toBe(0);
  });

  it("is a no-op / empty under SSR (no window)", () => {
    uninstallLocalStorage();
    expect(() => addDismissed("book1", "capture-style")).not.toThrow();
    expect(getOnboardingState("book1").dismissed.size).toBe(0);
    installLocalStorage(); // restore for afterEach symmetry
  });
});
