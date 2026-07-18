import { describe, it, expect } from "vitest";
import {
  buildPandocArgs,
  type PandocArgsInput,
} from "@/lib/import-export/export-pipeline";

/**
 * D-18 (S1/P0) regression lock — OS command injection in the export pipeline.
 *
 * Before the fix, the pandoc invocation was assembled as a single SHELL STRING
 * and run through `child_process.exec`, so writer-controlled fields (title,
 * scene-break glyph, custom template/css/cover paths — all validated only by
 * `z.string().max(N)`) could carry shell metacharacters and achieve RCE, e.g.
 * a title of  PWNED" & echo INJECTED > proof.txt & echo "  executed `echo`.
 *
 * The fix builds an ARGV ARRAY (buildPandocArgs) passed to `execFile` with NO
 * shell. These tests prove the argv is structurally injection-proof: each
 * writer-controlled value lands as EXACTLY ONE literal array element, unmodified
 * and never split on its shell metacharacters. That is a structural guarantee,
 * not escaping — there is no shell to interpret the characters at all.
 *
 * (Author is deliberately NOT a buildPandocArgs input: it flows into the YAML
 *  metadata block of the markdown FILE that pandoc reads, never onto the command
 *  line, so it is not an argv-injection vector. The typst template's `$title$`
 *  substitution is a pandoc template var, reviewer-verified safe.)
 */

// A payload packing every shell metacharacter that matters: quote, ampersand,
// semicolon, command substitution ($() and backticks), pipe, redirect, newline.
const EVIL = 'PWNED" & echo INJECTED > proof.txt & `id` $(whoami) | cat ; \n rm -rf /';

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

/** Assert `value` is present in the argv as exactly one whole element. */
function expectSingleLiteralElement(args: string[], value: string): void {
  const matches = args.filter((a) => a.includes(value));
  // Present in exactly one element (never fragmented across several).
  expect(matches).toHaveLength(1);
}

describe("buildPandocArgs (D-18 command-injection structural lock)", () => {
  it("returns an argv ARRAY of strings, not a shell command string", () => {
    const args = buildPandocArgs(baseInput());
    expect(Array.isArray(args)).toBe(true);
    for (const el of args) {
      expect(typeof el).toBe("string");
    }
    // Executable is element 0; execFile consumes args[0] + args.slice(1).
    expect(args[0]).toBe("C:\\Tools\\pandoc.exe");
    // Core invariants of the invocation are present.
    expect(args).toContain("--from=markdown");
    expect(args).toContain("--standalone");
    expect(args).toContain("-o");
    expect(args).toContain("/tmp/wmb/out.docx");
  });

  it("keeps a title full of shell metacharacters as ONE unmodified element", () => {
    const args = buildPandocArgs(baseInput({ title: EVIL }));
    const expected = `--metadata=title:${EVIL}`;
    // The whole payload is a single, verbatim argv token.
    expect(args).toContain(expected);
    expectSingleLiteralElement(args, EVIL);
    // Nothing was split off on `&`, `;`, `|`, whitespace, or newline.
    for (const el of args) {
      if (el === expected) continue;
      expect(el).not.toContain("PWNED");
      expect(el).not.toContain("echo");
      expect(el).not.toContain("rm -rf");
    }
  });

  it("keeps a malicious scene-break glyph as ONE unmodified element", () => {
    const args = buildPandocArgs(baseInput({ sceneBreakGlyph: EVIL }));
    expect(args).toContain(`--variable=scene-break-glyph:${EVIL}`);
    expectSingleLiteralElement(args, EVIL);
  });

  it("keeps a malicious docx reference-doc path as ONE unmodified element", () => {
    const args = buildPandocArgs(
      baseInput({ format: "docx", referenceDoc: EVIL })
    );
    expect(args).toContain(`--reference-doc=${EVIL}`);
    expectSingleLiteralElement(args, EVIL);
  });

  it("keeps malicious typst engine + template paths as single elements", () => {
    const args = buildPandocArgs(
      baseInput({
        format: "pdf",
        outputPath: "/tmp/wmb/out.pdf",
        typstEngine: `${EVIL}-engine`,
        typstTemplate: EVIL,
      })
    );
    expect(args).toContain(`--template=${EVIL}`);
    expect(args).toContain(`--pdf-engine=${EVIL}-engine`);
    expect(args).toContain("--to=pdf");
    expectSingleLiteralElement(args, `${EVIL}-engine`);
  });

  it("keeps malicious epub css + cover-image paths as single elements", () => {
    const args = buildPandocArgs(
      baseInput({
        format: "epub",
        outputPath: "/tmp/wmb/out.epub",
        epubCss: EVIL,
        epubCoverImage: `${EVIL}.png`,
      })
    );
    expect(args).toContain(`--css=${EVIL}`);
    expect(args).toContain(`--epub-cover-image=${EVIL}.png`);
    expect(args).toContain("-t");
    expect(args).toContain("epub3");
    expect(args).toContain("--split-level=1");
    expectSingleLiteralElement(args, `${EVIL}.png`);
  });

  it("keeps a Lua filter path with spaces/metacharacters as one element each", () => {
    const filters = [
      "/app/export-templates/scene-break.lua",
      `/tmp/${EVIL}/first-para.lua`,
    ];
    const args = buildPandocArgs(baseInput({ luaFilterPaths: filters }));
    expect(args).toContain(`--lua-filter=${filters[0]}`);
    expect(args).toContain(`--lua-filter=${filters[1]}`);
  });

  it("omits optional format args when their inputs are null", () => {
    const docx = buildPandocArgs(baseInput({ referenceDoc: null }));
    expect(docx.some((a) => a.startsWith("--reference-doc="))).toBe(false);

    const pdf = buildPandocArgs(
      baseInput({ format: "pdf", typstEngine: null, typstTemplate: null })
    );
    expect(pdf.some((a) => a.startsWith("--template="))).toBe(false);
    expect(pdf.some((a) => a.startsWith("--pdf-engine="))).toBe(false);

    const epub = buildPandocArgs(
      baseInput({ format: "epub", epubCss: null, epubCoverImage: null })
    );
    expect(epub.some((a) => a.startsWith("--css="))).toBe(false);
    expect(epub.some((a) => a.startsWith("--epub-cover-image="))).toBe(false);
  });
});
