// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

import { ScrollArea } from "@/components/ui/scroll-area";

/**
 * X-S12 / P2-S05 — the agent panel's chapter picker (`<ScrollArea
 * className="max-h-48">`) never scrolled. The cap sits on the Radix Root,
 * which is only `position: relative`; the Viewport is `size-full`, and a
 * percentage height against a parent with only a max-height resolves to
 * auto. So the viewport grew to the full list, spilled out of the 192px box,
 * and — the Root being positioned — painted and hit-tested over the Back /
 * Start row below it. From 7 chapters on, a click on Start picked Ch. 7.
 *
 * jsdom has no layout engine, so this pins the contract the verifier proved
 * in a real browser: the viewport inherits the Root's max-height, which
 * makes it the scroll container the cap intends.
 */

afterEach(() => cleanup());

describe("ScrollArea with only a max-height", () => {
  it("caps the viewport at the root's max-height so the list scrolls inside it", () => {
    const { container } = render(
      <ScrollArea className="max-h-48">
        {Array.from({ length: 12 }, (_, i) => (
          <button key={i}>Ch. {i + 1}</button>
        ))}
      </ScrollArea>
    );
    const root = container.querySelector('[data-slot="scroll-area"]')!;
    const viewport = container.querySelector('[data-slot="scroll-area-viewport"]')!;

    expect(root.className).toContain("max-h-48");
    expect(viewport.className.split(/\s+/)).toContain("max-h-[inherit]");
  });
});
