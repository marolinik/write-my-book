import { describe, it, expect } from "vitest";
import { importConfirmRequestSchema } from "@/lib/validation";

const chapter = (number: number) => ({ number, title: `Chapter ${number}`, content: "Text.", action: "create" as const });

describe("importConfirmRequestSchema", () => {
  it("refuses more chapters than a book can number (999)", () => {
    const chapters = Array.from({ length: 1000 }, (_, i) => chapter((i % 999) + 1));
    expect(importConfirmRequestSchema.safeParse({ chapters }).success).toBe(false);
  });

  it("accepts a full 999-chapter import", () => {
    const chapters = Array.from({ length: 999 }, (_, i) => chapter(i + 1));
    expect(importConfirmRequestSchema.safeParse({ chapters }).success).toBe(true);
  });
});
