// P1-23 / P2-8 / P2-72 / P2-74 / P2-77: a failed pandoc conversion was
// answered 200, shown as "Export Complete" with a .md file, and the warning
// carried the server command line; the 500 branch echoed error.message (paths,
// bucket names); the template name reached a filesystem path unchecked; YAML
// metadata was built by string interpolation (a quote broke it, a newline
// injected keys); and the export history listed every object under the book.
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { exportConfigSchema, exportRequestSchema } from "@/lib/validation";
import { buildYamlMetadata, ExportConversionError } from "@/lib/import-export/export-pipeline";
import { literalPrefixOf } from "@/lib/storage/s3-adapter";

const ROOT = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf-8");

describe("YAML metadata", () => {
  it("survives quotes, backslashes and newlines without injecting keys", () => {
    const yaml = buildYamlMetadata({
      title: 'The "Salt" Letters\\\nheader-includes: "<script>x</script>"',
      author: "Ana \"A\" Writer",
      lang: "en",
      sceneBreak: "\\*",
      paperSize: "a5",
      mainFont: "EB Garamond",
      lineStretch: 1.2,
      draft: false,
    });
    const lines = yaml.split("\n");
    expect(lines.filter((l) => l.startsWith("header-includes"))).toEqual([]);
    expect(lines.find((l) => l.startsWith("title:"))).toBe(
      `title: ${JSON.stringify('The "Salt" Letters\\\nheader-includes: "<script>x</script>"')}`
    );
  });
});

describe("conversion failure", () => {
  it("is a typed error with a code and a message free of server details", () => {
    const err = new ExportConversionError("pandoc exited 64: /tmp/wmb-export-123/book.md");
    expect(err.code).toBe("CONVERSION_FAILED");
    expect(err.message).not.toContain("/tmp/");
  });

  it("the pipeline no longer returns a markdown fallback as if it were the export", () => {
    const pipeline = read("src", "lib", "import-export", "export-pipeline.ts");
    expect(pipeline).not.toContain("Saved as markdown.");
    expect(pipeline).toContain("throw new ExportConversionError(");
  });

  it.each([
    ["src/app/api/books/[id]/export/route.ts"],
    ["src/app/api/series/[id]/export/route.ts"],
  ])("%s answers 502 CONVERSION_FAILED and never echoes error.message", (file) => {
    const route = read(...file.split("/"));
    expect(route).toContain('"CONVERSION_FAILED"');
    expect(route).toContain("status: 502");
    expect(route).not.toMatch(/error: \(error as Error\)\.message/);
  });
});

describe("template names (P2-72)", () => {
  it("refuses path segments in the export template and the genre template", () => {
    expect(exportRequestSchema.safeParse({ format: "docx", template: "../x" }).success).toBe(false);
    expect(exportRequestSchema.safeParse({ format: "docx", template: "genre" }).success).toBe(true);
    const config = exportConfigSchema.shape.format;
    expect(config.shape.genreTemplate.safeParse("../../etc/passwd").success).toBe(false);
    expect(config.shape.genreTemplate.safeParse("literary-fiction").success).toBe(true);
  });
});

describe("export history (P2-77)", () => {
  it("lists from the pattern's literal prefix, not the whole book", () => {
    expect(literalPrefixOf("exports/*")).toBe("exports/");
    expect(literalPrefixOf("manuscript/**/*.md")).toBe("manuscript/");
    expect(literalPrefixOf("*.md")).toBe("");
  });

  it("sorts exports by when they were written, newest first", () => {
    const route = read("src", "app", "api", "books", "[id]", "export", "route.ts");
    expect(route).toMatch(/lastModified/);
  });
});

vi.mock("@/lib/db", () => ({ db: {} }));
