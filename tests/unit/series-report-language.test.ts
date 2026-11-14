// Wave 7 Task 3: the printable series report was English whatever the
// writer's language (title, column heads, totals, statuses, "generated").
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { getUIStrings } from "@/lib/i18n/ui-strings";

const h = vi.hoisted(() => ({
  db: { series: { findFirst: vi.fn() }, book: { findMany: vi.fn() } },
  user: { id: "u1", preferredLanguage: "sr" as string | null },
}));
vi.mock("@/lib/auth", () => ({ requireUser: async () => h.user }));
vi.mock("@/lib/db", () => ({ db: h.db }));

import { GET } from "@/app/api/series/[id]/report/route";

const S = "00000000-0000-4000-8000-0000000000aa";
const call = () => GET(new NextRequest(`http://test/api/series/${S}/report`), { params: Promise.resolve({ id: S }) });

beforeEach(() => {
  h.db.series.findFirst.mockResolvedValue({ id: S, userId: "u1", title: "Slana pisma", genre: null, description: null });
  h.db.book.findMany.mockResolvedValue([
    { bookNumber: 1, name: "Prva", status: "writing", wordCount: 41000, createdAt: new Date(), _count: { chapters: 12, documents: 5 } },
    { bookNumber: 2, name: "Druga", status: "complete", wordCount: 52000, createdAt: new Date(), _count: { chapters: 14, documents: 6 } },
  ]);
});

describe("GET /series/:id/report in the writer's language", () => {
  it("a Serbian writer's report has Serbian headings, statuses and totals", async () => {
    h.user.preferredLanguage = "sr";
    const html = await (await call()).text();
    const sr = getUIStrings("sr").seriesReport;
    for (const word of [sr.title, sr.book, sr.chapters, sr.words, sr.writing, sr.complete]) expect(html).toContain(word);
    expect(html).toContain('lang="sr"');
    for (const english of ["Series Report", ">Book<", ">Chapters<", "Words:", "generated ", ">Writing<", ">Complete<"]) {
      expect(html).not.toContain(english);
    }
  });

  it("an English writer still gets English", async () => {
    h.user.preferredLanguage = "en";
    const html = await (await call()).text();
    expect(html).toContain(getUIStrings("en").seriesReport.title);
    expect(html).toContain("Complete");
  });
});
