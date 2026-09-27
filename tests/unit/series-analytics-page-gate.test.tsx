// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { getUIStrings } from "@/lib/i18n/ui-strings";

/**
 * X-S19 — series Analytics had no plan gate on the page.
 *
 * GET /api/series/:id/analytics answers a non-Professional writer 403 +
 * upgradeToTier, but /series/:id/analytics is a server page that read the same
 * numbers straight from the database and rendered them (HTTP 200, full stats).
 * The page must ask the same `use_analytics` gate, and a denied writer gets
 * the upgrade path instead of the data.
 */

const h = vi.hoisted(() => ({
  requireUser: vi.fn(),
  checkPlanAccess: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  db: {
    series: { findFirst: vi.fn() },
    book: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/billing/plan-gating", () => ({
  checkPlanAccess: (...a: unknown[]) => h.checkPlanAccess(...a),
}));
vi.mock("next/navigation", () => ({ notFound: () => h.notFound() }));

import SeriesAnalyticsPage from "@/app/(app)/series/[seriesId]/analytics/page";

const EN = getUIStrings("en");
const SR = getUIStrings("sr");
const props = { params: Promise.resolve({ seriesId: "series-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue({ id: "u1", preferredLanguage: "en" });
  h.db.series.findFirst.mockResolvedValue({
    id: "series-1",
    title: "Salt Crown",
    seriesType: "trilogy",
  });
  h.db.book.findMany.mockResolvedValue([
    {
      id: "b1",
      bookNumber: 1,
      name: "The First Tide",
      status: "writing",
      wordCount: 46740,
      chapters: [{ chapterNumber: 1, status: "drafted", wordCount: 46740 }],
    },
  ]);
});

afterEach(() => cleanup());

describe("/series/:id/analytics — the page asks the same use_analytics gate", () => {
  it("shows the upgrade path, not the numbers, when the plan does not include analytics", async () => {
    h.checkPlanAccess.mockResolvedValue({
      allowed: false,
      reason: "Advanced analytics requires the Professional plan or higher.",
      upgradeToTier: "professional",
    });

    render(await SeriesAnalyticsPage(props));

    expect(h.checkPlanAccess).toHaveBeenCalledWith("u1", "use_analytics");
    expect(h.db.book.findMany).not.toHaveBeenCalled();
    expect(screen.queryByText(/The First Tide/)).toBeNull();
    expect(screen.getByText(EN.appUI.upgradeRequired)).toBeTruthy();
    expect(screen.getByText(EN.appUI.tierProfessional)).toBeTruthy();
    const plans = screen.getByRole("link", { name: EN.appUI.viewPlans });
    expect(plans.getAttribute("href")).toBe("/settings/billing");
  });

  it("speaks the writer's language on the wall", async () => {
    h.requireUser.mockResolvedValue({ id: "u1", preferredLanguage: "sr" });
    h.checkPlanAccess.mockResolvedValue({ allowed: false, upgradeToTier: "professional" });

    render(await SeriesAnalyticsPage(props));

    expect(screen.getByText(SR.appUI.upgradeRequired)).toBeTruthy();
    expect(screen.getByRole("link", { name: SR.appUI.viewPlans })).toBeTruthy();
  });

  it("renders the stats when the plan includes analytics", async () => {
    h.checkPlanAccess.mockResolvedValue({ allowed: true });

    render(await SeriesAnalyticsPage(props));

    expect(h.db.book.findMany).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/The First Tide/)).toBeTruthy();
    expect(screen.queryByText(EN.appUI.upgradeRequired)).toBeNull();
  });

  it("still 404s a series the writer does not own, before any plan question", async () => {
    h.db.series.findFirst.mockResolvedValue(null);
    await expect(SeriesAnalyticsPage(props)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(h.db.book.findMany).not.toHaveBeenCalled();
  });
});
