import { describe, it, expect } from "vitest";
import {
  buildPandocArgs,
  sanitizeManuscriptForConverter,
  type PandocArgsInput,
} from "@/lib/import-export/export-pipeline";

/**
 * D-3 (S1/P0) regression locks — resource-isolation of the pandoc converter.
 *
 * Two layers:
 *  1. `--sandbox` (pandoc >= 3.1) restricts reader/writer IO to the files named
 *     on the command line plus the cwd (the export temp dir), blocking arbitrary
 *     server-file reads and network access. It must be present for every format.
 *  2. `sanitizeManuscriptForConverter` strips pandoc resource primitives (unsafe
 *     images, raw-HTML embed tags, include directives) from the assembled
 *     manuscript before conversion, so writer- or smuggled-content can never make
 *     pandoc read server files even through paths pandoc's own sandbox does not
 *     cap (Lua-filter IO and PDF-engine subprocess IO).
 */
function baseInput(overrides: Partial<PandocArgsInput> = {}): PandocArgsInput {
  return {
    pandocCmd: "C:\\Tools\\pandoc.exe",
    inputPath: "/tmp/wmb/manuscript.md",
    outputPath: "/tmp/wmb/out.docx",
    format: "docx",
    luaFilterPaths: ["/app/export-templates/scene-break.lua"],
    title: "A Normal Title",
    sceneBreakGlyph: "***",
    ...overrides,
  };
}

describe("buildPandocArgs includes --sandbox for every format (D-3)", () => {
  it("docx conversion is sandboxed", () => {
    const args = buildPandocArgs(baseInput({ format: "docx" }));
    expect(args).toContain("--sandbox");
  });

  it("pdf conversion is sandboxed", () => {
    const args = buildPandocArgs(
      baseInput({
        format: "pdf",
        outputPath: "/tmp/wmb/out.pdf",
        typstEngine: "/usr/bin/typst",
      })
    );
    expect(args).toContain("--sandbox");
    expect(args).toContain("--to=pdf");
  });

  it("epub conversion is sandboxed", () => {
    const args = buildPandocArgs(
      baseInput({ format: "epub", outputPath: "/tmp/wmb/out.epub" })
    );
    expect(args).toContain("--sandbox");
    expect(args).toContain("-t");
    expect(args).toContain("epub3");
  });

  it("--sandbox is a discrete argv element and pandoc stays argv[0]", () => {
    const args = buildPandocArgs(baseInput({ format: "epub" }));
    expect(args[0]).toBe("C:\\Tools\\pandoc.exe");
    const idx = args.indexOf("--sandbox");
    expect(idx).toBeGreaterThan(0);
    expect(args[idx]).toBe("--sandbox"); // not glued onto another flag
  });
});

describe("sanitizeManuscriptForConverter neutralizes local-file image refs (D-3)", () => {
  it("removes an absolute-path markdown image", () => {
    expect(sanitizeManuscriptForConverter("![x](/etc/passwd)")).not.toContain(
      "/etc/passwd"
    );
    expect(sanitizeManuscriptForConverter("![x](/etc/passwd)")).not.toMatch(
      /\!\[/
    );
  });

  it("removes a ../ traversal image reference", () => {
    expect(sanitizeManuscriptForConverter("![x](../secret)")).not.toContain(
      "../secret"
    );
  });

  it("removes an http(s) URL image (SSRF / remote-fetch vector)", () => {
    expect(
      sanitizeManuscriptForConverter("![x](https://evil.com/a.png)").trim()
    ).toBe("");
    expect(sanitizeManuscriptForConverter("![x](http://evil.com/a.jpg)")).not.toContain(
      "http"
    );
  });

  it("removes a data: URI image (embed vector)", () => {
    expect(
      sanitizeManuscriptForConverter("![x](data:image/png;base64,/etc/passwd)")
    ).not.toContain("data:");
    expect(sanitizeManuscriptForConverter("![x](data:image/png;base64,)")).not.toMatch(
      /\!\[/
    );
  });

  it("removes a file:// reference image", () => {
    expect(sanitizeManuscriptForConverter("![x](file:///etc/passwd)")).not.toContain(
      "file:"
    );
  });

  it("removes a raw <img tag whose src is an absolute path (raw-HTML is passed through on docx/epub/html)", () => {
    const out = sanitizeManuscriptForConverter(
      'text before <img src="/etc/passwd" /> text after'
    );
    expect(out).not.toContain("img");
    expect(out).not.toContain("/etc/passwd");
  });

  it("removes an <iframe>/<object>/<embed> raw-HTML tag with an absolute src", () => {
    expect(sanitizeManuscriptForConverter('<iframe src="/etc/passwd"></iframe>')).toBe("");
    expect(
      sanitizeManuscriptForConverter('<object data="/etc/passwd"></object>')
    ).toBe("");
    expect(sanitizeManuscriptForConverter('<embed src="/etc/passwd">')).toBe("");
  });

  it("neutralizes pandoc include-style directives and template braces", () => {
    expect(
      sanitizeManuscriptForConverter("\\include{config-secrets.md}").trim()
    ).not.toMatch(/\\include/);
    expect(sanitizeManuscriptForConverter("\\input{mydoc.md}")).not.toContain(
      "\\input"
    );
    // Doubled template braces are collapsed so a smuggled include can't be read.
    expect(sanitizeManuscriptForConverter("{{ include /etc/passwd }}")).toContain(
      "/etc/passwd"
    );
    expect(sanitizeManuscriptForConverter("{{x}}")).toBe("{x}");
  });
});

describe("sanitizeManuscriptForConverter preserves legitimate content (D-3)", () => {
  it("keeps ordinary prose, bold/italic, headings, and lists untouched", () => {
    const md = [
      "# Title Here",
      "",
      "A **bold word and *italic* text.",
      "A - bulleted list item.",
      "> blockquote line",
    ].join("\n");
    expect(sanitizeManuscriptForConverter(md)).toBe(md);
  });

  it("keeps normal markdown hyperlinks (they are not embedded images)", () => {
    const md = "See [the docs](https://example.com/intro (a link to the page)).";
    // Normal links remain; only images are restricted.
    expect(sanitizeManuscriptForConverter(md)).toBe(md);
  });

  it("keeps bare relative same-dir image refs and the assembler's \\newpage", () => {
    // A legit bare same-dir cover reference must survive untouched.
    expect(sanitizeManuscriptForConverter("![Cover](cover.png)")).toBe(
      "![Cover](cover.png)"
    );
    // The assembler's raw TeX (\newpage) must never be touched by the sanitizer.
    expect(sanitizeManuscriptForConverter("# C\n\n\\newpage\n")).toContain(
      "\\newpage"
    );
  });

  it("keeps a safe same-dir image but drops an unsafe one in the same string", () => {
    const out = sanitizeManuscriptForConverter(
      "keep ![good](pic.png \"a title\") and drop ![bad](/etc/secret.png)"
    );
    expect(out).toContain("keep ![good](pic.png \"a title\") and drop ");
    expect(out).not.toContain("/etc/secret.png");
    expect(out).not.toMatch(/.*bad.*/);
  });
});