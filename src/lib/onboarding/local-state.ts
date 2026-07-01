// src/lib/onboarding/local-state.ts
const DISMISSED_PREFIX = "wmb:onboard-dismissed:";
const TOASTED_PREFIX = "wmb:onboard-toasted:";

function readSet(key: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function addToSet(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    const set = readSet(key);
    set.add(value);
    window.localStorage.setItem(key, JSON.stringify([...set]));
  } catch {
    // ignore quota/permission failures
  }
}

export interface OnboardingLocalState {
  dismissed: Set<string>;
  toasted: Set<string>;
}

export function getOnboardingState(bookId: string): OnboardingLocalState {
  return {
    dismissed: readSet(DISMISSED_PREFIX + bookId),
    toasted: readSet(TOASTED_PREFIX + bookId),
  };
}

export function addDismissed(bookId: string, workflowId: string): void {
  addToSet(DISMISSED_PREFIX + bookId, workflowId);
}

export function addToasted(bookId: string, workflowId: string): void {
  addToSet(TOASTED_PREFIX + bookId, workflowId);
}
