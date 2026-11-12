// @vitest-environment jsdom
// P1-22: the marketing kit rendered the model's storeDescription with
// dangerouslySetInnerHTML and no sanitizer, and the route persisted whatever
// JSON the model returned. A prompt-injected manuscript could make the model
// write <img onerror=…> into a page the writer opens. The kit is now
// schema-checked before it is saved, its store HTML is reduced to a short tag
// allowlist, and the component renders text only.
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getUIStrings } from "@/lib/i18n/ui-strings";
import { parseMarketingKit, sanitizeStoreHtml } from "@/lib/marketing/marketing-kit";

const h = vi.hoisted(() => ({
  kit: {
    logline: "A keeper of letters learns what the sea kept.",
    blurb: "Blurb text.",
    storeDescription:
      '<p>A <b onclick="x()">gripping</b> tale.</p><img src=x onerror="alert(1)"><script>alert(2)</script>',
    compTitles: ["The Shipping News by Annie Proulx"],
    socialPosts: ["Out now #books"],
    emailAnnouncement: "Dear reader,",
    generatedAt: "2026-11-11T00:00:00.000Z",
  },
}));

vi.mock("@/lib/api-client", () => ({ fetchJson: vi.fn(async () => h.kit) }));
vi.mock("@/components/providers/language-provider", () => ({
  useLanguage: () => ({ language: "en", t: getUIStrings("en") }),
  useLocale: () => "en-US",
}));

import { MarketingKit } from "@/components/book/marketing-kit";

afterEach(cleanup);

describe("MarketingKit", () => {
  it("renders a stored store description as text: no img, no script, no handler", async () => {
    const { container, findByText } = render(
      <QueryClientProvider client={new QueryClient()}>
        <MarketingKit bookId="b1" bookTitle="The Salt Letters" />
      </QueryClientProvider>
    );
    fireEvent.mouseDown(await findByText(getUIStrings("en").bookUI.store));
    // The store tab is open once its heading is on screen.
    await findByText(getUIStrings("en").bookUI.storeDescriptionHtml);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.innerHTML).not.toContain("onerror");
    await findByText(/A gripping tale\./);
  });

  it("never sets inner HTML", () => {
    const src = readFileSync(join(__dirname, "..", "..", "src", "components", "book", "marketing-kit.tsx"), "utf-8");
    expect(src).not.toContain("dangerouslySetInnerHTML");
  });
});

describe("parseMarketingKit", () => {
  it("accepts a well-formed kit, fenced or not, and keeps only safe store markup", () => {
    const kit = parseMarketingKit("```json\n" + JSON.stringify(h.kit) + "\n```");
    expect(kit?.storeDescription).toBe("<p>A <b>gripping</b> tale.</p>");
    expect(kit?.compTitles).toEqual(["The Shipping News by Annie Proulx"]);
  });

  it("refuses a kit with a missing or wrong-typed field, and text that is not JSON", () => {
    expect(parseMarketingKit(JSON.stringify({ ...h.kit, socialPosts: "one post" }))).toBeNull();
    const withoutBlurb: Record<string, unknown> = { ...h.kit };
    delete withoutBlurb.blurb;
    expect(parseMarketingKit(JSON.stringify(withoutBlurb))).toBeNull();
    expect(parseMarketingKit("Sorry, I cannot help with that.")).toBeNull();
  });

  it("sanitizeStoreHtml strips attributes and every tag outside the allowlist", () => {
    expect(sanitizeStoreHtml('<ul><li style="x">One</li></ul><a href="javascript:x">link</a><iframe src=y></iframe>')).toBe(
      "<ul><li>One</li></ul>link"
    );
  });
});

describe("the marketing kit route", () => {
  const route = readFileSync(
    join(__dirname, "..", "..", "src", "app", "api", "books", "[id]", "marketing-kit", "route.ts"),
    "utf-8"
  );

  it("validates the model's kit before saving it, and refuses an invalid one with 502", () => {
    expect(route).toContain("parseMarketingKit(");
    expect(route.indexOf("parseMarketingKit(")).toBeLessThan(route.indexOf("UPDATE books SET marketing_kit"));
    expect(route).toContain("status: 502");
  });

  it("does not echo the provider's error message", () => {
    expect(route).not.toContain("AI generation failed: ${message}");
  });
});
