import { NextResponse } from "next/server";
import { ZodError } from "zod";

/**
 * Client-safe rendering of a Zod validation failure.
 *
 * The routes previously returned the raw `ZodError` (or its `.issues` array) as
 * the 400 `details` payload. Serialized, that leaks schema internals to the
 * client — issue `code`s, `expected`/`received` types, union-branch trees, and
 * (for some issues) the submitted input echoed back. This maps each issue down
 * to just its field path and human-readable message, matching the shape the
 * few already-correct routes produce via `.flatten()` (`fieldErrors` keyed by
 * field, `formErrors` for top-level issues). Built from `issue.path`/`.message`
 * directly so it is independent of Zod's version-specific `.flatten()` surface.
 */
export function zodErrorDetails(error: unknown): {
  fieldErrors: Record<string, string[]>;
  formErrors: string[];
} {
  const issues = (error as ZodError)?.issues;
  const fieldErrors: Record<string, string[]> = {};
  const formErrors: string[] = [];
  if (!Array.isArray(issues)) {
    return { fieldErrors, formErrors };
  }
  for (const issue of issues) {
    const key = Array.isArray(issue.path) ? issue.path.join(".") : "";
    if (key) {
      (fieldErrors[key] ??= []).push(issue.message);
    } else {
      formErrors.push(issue.message);
    }
  }
  return { fieldErrors, formErrors };
}

/**
 * Standard 400 envelope for a Zod validation failure. Sends only the plain
 * field/form messages to the client; logs the full error server-side so no
 * diagnostic detail is lost. Returns `null` when `error` is not a Zod error, so
 * callers can fall through to their remaining handling — mirroring the
 * `invalidJsonBodyResponse` idiom already used across these route catch blocks.
 */
export function zodErrorResponse(error: unknown): NextResponse | null {
  const isZodError =
    error instanceof ZodError ||
    (error as { name?: string } | null)?.name === "ZodError";
  if (!isZodError) return null;
  console.error("[api] request failed schema validation:", error);
  return NextResponse.json(
    { error: "Invalid input", details: zodErrorDetails(error) },
    { status: 400 }
  );
}
