// P2-76 / D19: one export per writer at a time, and a converter timeout kills
// the whole process group (pandoc's Typst child too).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { withExportSlot, runConverter, ConverterTimeoutError, ConverterExitError } from "@/lib/import-export/export-limits";

describe("withExportSlot", () => {
  it("refuses a second export for the same writer while one runs, and frees the slot after", async () => {
    let release!: () => void;
    const first = withExportSlot("u1", () => new Promise<string>((r) => (release = () => r("done"))));
    expect(await withExportSlot("u1", async () => "second")).toBeNull();
    expect(await withExportSlot("u2", async () => "other writer")).toEqual({ value: "other writer" });
    release();
    expect(await first).toEqual({ value: "done" });
    expect(await withExportSlot("u1", async () => "again")).toEqual({ value: "again" });
  });

  it("frees the slot when the export throws", async () => {
    await expect(withExportSlot("u3", async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(await withExportSlot("u3", async () => 1)).toEqual({ value: 1 });
  });
});

describe("runConverter", () => {
  it("resolves on exit 0 and rejects with the exit code otherwise", async () => {
    await expect(runConverter(process.execPath, ["-e", "process.exit(0)"], { cwd: process.cwd(), timeoutMs: 10_000 })).resolves.toBeTruthy();
    await expect(
      runConverter(process.execPath, ["-e", "console.error('bad input'); process.exit(64)"], { cwd: process.cwd(), timeoutMs: 10_000 })
    ).rejects.toBeInstanceOf(ConverterExitError);
  });

  it("kills a converter that outlives its budget", async () => {
    const started = Date.now();
    await expect(
      runConverter(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { cwd: process.cwd(), timeoutMs: 500 })
    ).rejects.toBeInstanceOf(ConverterTimeoutError);
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it.skipIf(process.platform === "win32")("kills the converter's children too (process group)", async () => {
    // The parent spawns a grandchild that writes a heartbeat; after the group
    // kill the heartbeat must stop.
    const marker = `/tmp/wmb-converter-${Date.now()}`;
    const script = `
      const { spawn } = require("node:child_process");
      spawn(process.execPath, ["-e", "setInterval(() => require('node:fs').writeFileSync('${marker}', String(Date.now())), 100)"], { stdio: "ignore" });
      setTimeout(() => {}, 60000);`;
    await expect(runConverter(process.execPath, ["-e", script], { cwd: process.cwd(), timeoutMs: 800 })).rejects.toBeInstanceOf(ConverterTimeoutError);
    await new Promise((r) => setTimeout(r, 400));
    const fs = await import("node:fs");
    const before = fs.readFileSync(marker, "utf8");
    await new Promise((r) => setTimeout(r, 500));
    expect(fs.readFileSync(marker, "utf8")).toBe(before);
    fs.unlinkSync(marker);
  });
});

describe("wiring", () => {
  it("the pipeline runs pandoc through runConverter", () => {
    const src = readFileSync("src/lib/import-export/export-pipeline.ts", "utf8");
    expect(src).toMatch(/runConverter\(pandocArgs\[0\]/);
  });

  it.each(["src/app/api/books/[id]/export/route.ts", "src/app/api/series/[id]/export/route.ts"])("%s takes the writer's export slot", (file) => {
    expect(readFileSync(file, "utf8")).toMatch(/withExportSlot\(/);
  });
});
