// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { SidebarInset } from "@/components/ui/sidebar";

// D-09: axe found `landmark-no-duplicate-main` + `landmark-main-is-top-level`
// on every app screen. Root cause: the shadcn `SidebarInset` wrapper rendered
// a <main>, and the (app) layout nests the real content <main> inside it — two
// mains, the inner one contained in the outer. The fix (commit fd386f8) demotes
// SidebarInset to a <div>. This test is the regression guard: SidebarInset must
// NOT be a landmark, so a page that renders its own <main> inside it yields
// exactly one main. Reverting SidebarInset to <main> re-reds this (2 mains).

afterEach(() => cleanup());

describe("D-09 single <main> landmark per screen", () => {
  it("SidebarInset renders a non-landmark <div>", () => {
    const { container } = render(<SidebarInset>content</SidebarInset>);
    const inset = container.querySelector('[data-slot="sidebar-inset"]');
    expect(inset).not.toBeNull();
    expect(inset?.tagName).toBe("DIV");
    expect(container.querySelectorAll("main, [role='main']").length).toBe(0);
  });

  it("a page <main> nested inside SidebarInset is the ONLY main landmark", () => {
    const { container } = render(
      <SidebarInset>
        <main>page content</main>
      </SidebarInset>
    );
    expect(container.querySelectorAll("main, [role='main']").length).toBe(1);
  });
});
