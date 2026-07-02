import { describe, it, expect } from "vitest";
import { updateFindingSchema } from "@/lib/validation";

describe("updateFindingSchema", () => {
  it("accepts overrideText on apply", () => {
    const p = updateFindingSchema.parse({ action: "apply", overrideText: "edited replacement" });
    expect(p.overrideText).toBe("edited replacement");
  });
  it("still parses without overrideText", () => {
    expect(updateFindingSchema.parse({ action: "dismiss", reason: "mine" }).overrideText).toBeUndefined();
  });
});
