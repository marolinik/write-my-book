import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * D-05: PDF exports carried no document metadata (pypdf title=None) while
 * DOCX correctly set dc:title/dc:creator. The pipeline routes PDF through
 * `pandoc --pdf-engine=typst --template=export-templates/typst-book.typ`
 * (export-pipeline.ts, format === "pdf" branch), and Typst only embeds PDF
 * metadata when the source calls `set document(...)` — which the custom
 * template never did. Pandoc's docx writer maps title/author metadata into
 * core properties automatically; the typst template must do it explicitly.
 *
 * Why a template-contract test and not an invocation assertion:
 * exportManuscript builds its pandoc command inline and shells out via
 * execAsync, so the constructed args are not observable without executing the
 * real pandoc+typst binaries — and the title/author metadata was ALREADY
 * passed correctly (YAML block + --metadata=title). The defect and the fix
 * both live in the template, so the metadata contract is pinned here.
 */

const template = readFileSync(
  join(process.cwd(), "export-templates", "typst-book.typ"),
  "utf-8"
);

describe("typst-book.typ: PDF document metadata (D-05)", () => {
  it("declares a `set document` block mapping pandoc's title metadata", () => {
    expect(template).toContain("#set document(");
    expect(template).toContain('title: "$title$"');
  });

  it("maps author metadata only when provided (mirrors docx omitting dc:creator)", () => {
    // The running-head falls back to a literal "Author"; PDF metadata must
    // never fabricate that — author is guarded by pandoc's $if(author)$.
    const setDocIdx = template.indexOf("#set document(");
    const setDocBlock = template.slice(setDocIdx, template.indexOf("#show:"));
    expect(setDocBlock).toContain('$if(author)$author: "$author$",$endif$');
    expect(setDocBlock).not.toContain("Author$endif$");
  });

  it("sets document metadata at top level, before the template body renders", () => {
    // Typst requires `set document` before any content: it must precede both
    // the `#show:` template application and the `$body$` insertion point.
    const setDocIdx = template.indexOf("#set document(");
    expect(setDocIdx).toBeGreaterThan(-1);
    expect(setDocIdx).toBeLessThan(template.indexOf("#show:"));
    expect(setDocIdx).toBeLessThan(template.indexOf("$body$"));
  });
});
