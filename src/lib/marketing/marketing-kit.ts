import { z } from "zod";

/**
 * P1-22: the marketing kit is model output. It is schema-checked before it is
 * saved, its store description keeps only a short tag allowlist (stores such
 * as KDP accept that much HTML), and the app renders it as text, never HTML.
 */

const text = (max: number) => z.string().trim().min(1).max(max);

export const marketingKitSchema = z.object({
  logline: text(600),
  blurb: text(6_000),
  storeDescription: text(10_000),
  compTitles: z.array(text(300)).max(10),
  socialPosts: z.array(text(2_000)).max(10),
  emailAnnouncement: text(10_000),
});

export type MarketingKitFields = z.infer<typeof marketingKitSchema>;

const ALLOWED_STORE_TAGS = new Set(["b", "strong", "i", "em", "p", "br", "ul", "ol", "li"]);
const DROPPED_WITH_CONTENT = /<(script|style|iframe|object|embed|template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

/** Keeps the allowlisted tags, without attributes; drops every other tag. */
export function sanitizeStoreHtml(html: string): string {
  return html
    .replace(DROPPED_WITH_CONTENT, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (tag, name: string) => {
      const lower = name.toLowerCase();
      if (!ALLOWED_STORE_TAGS.has(lower)) return "";
      if (lower === "br") return "<br>";
      return tag.startsWith("</") ? `</${lower}>` : `<${lower}>`;
    });
}

const ENTITIES: Array<[RegExp, string]> = [
  [/&nbsp;/g, " "],
  [/&lt;/g, "<"],
  [/&gt;/g, ">"],
  [/&quot;/g, '"'],
  [/&#39;/g, "'"],
  [/&amp;/g, "&"],
];

/** The store description as plain text for display: line breaks kept, tags gone. */
export function storeHtmlToText(html: string): string {
  const stripped = html
    .replace(DROPPED_WITH_CONTENT, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol)>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "• ")
    .replace(/<[^>]*>/g, "");
  return ENTITIES.reduce((acc, [pattern, value]) => acc.replace(pattern, value), stripped)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Parses the model's reply (fenced or not); null when it is not a valid kit. */
export function parseMarketingKit(raw: string): MarketingKitFields | null {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch {
    return null;
  }
  const parsed = marketingKitSchema.safeParse(json);
  if (!parsed.success) return null;
  return { ...parsed.data, storeDescription: sanitizeStoreHtml(parsed.data.storeDescription) };
}
