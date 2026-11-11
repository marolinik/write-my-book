import { z } from "zod";

export const HANDLED_CLERK_EVENTS = ["user.created", "user.updated", "user.deleted"] as const;
export type HandledClerkEvent = (typeof HANDLED_CLERK_EVENTS)[number];

const clerkUserEventSchema = z.object({
  type: z.enum(HANDLED_CLERK_EVENTS),
  data: z.looseObject({ id: z.string().startsWith("user_") }),
});

export type ClerkUserEvent = z.infer<typeof clerkUserEventSchema>;

export type ParsedClerkEvent =
  | { kind: "event"; event: ClerkUserEvent }
  | { kind: "ignored"; type: string }
  | { kind: "invalid"; reason: string };

/**
 * Validate a verified Clerk payload before anything touches the database
 * (P1-1). A signed event can still be malformed: `user.deleted` without an id
 * once meant `deleteMany({ where: { clerkId: undefined } })`, which deletes
 * every user. Event types we do not handle are acknowledged and ignored.
 */
export function parseClerkEvent(payload: unknown): ParsedClerkEvent {
  const type = (payload as { type?: unknown } | null)?.type;
  if (typeof type !== "string") return { kind: "invalid", reason: "missing event type" };
  if (!(HANDLED_CLERK_EVENTS as readonly string[]).includes(type)) return { kind: "ignored", type };
  const parsed = clerkUserEventSchema.safeParse(payload);
  if (!parsed.success) return { kind: "invalid", reason: parsed.error.issues[0]?.message ?? "invalid payload" };
  return { kind: "event", event: parsed.data };
}
