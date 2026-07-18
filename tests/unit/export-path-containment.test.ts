import { describe, it, expect } from "vitest";
import { resolve, sep } from "path";
import {
  isSafeTemplatePath,
  resolveSafeTemplatePath,
  TEMPLATE_ALLOWLIST_DIR,
} from "@/lib/import-export/safe-path";
import { exportConfigSchema, exportConfigUpdateSchema } from "@/lib/validation";
import { getDefaultExportConfig } from "@/lib/import-export/export-config";

/**
 * D-21 (S1) regression lock — SSRF + arbitrary local file read via unvalidated
 * export-config paths.
 *
 * config.customTemplates.{docxReference,typstTemplate,epubCss} and
 * config.frontMatter.coverImagePath are writer-settable (authenticated PUT
 * /api/books/:id/export/config) and flow to pandoc as raw paths/URLs
 * (`--css=URL` fetches → SSRF; local path → embeds `.env`/secrets). There is NO
 * upload flow for these files, so a legitimate value is empty (bundled default)
 * or a relative path inside the bundled `export-templates/` directory. These
 * tests prove URLs, UNC, absolute, and `../` escapes are rejected while
 * legitimate relative paths pass — at BOTH the pure validator and the Zod
 * schema used by the PUT boundary.
 */

describe("isSafeTemplatePath (D-21 containment predicate)", () => {
  it("allows empty (means: use bundled default)", () => {
    expect(isSafeTemplatePath("")).toBe(true);
  });

  it("allows a relative path that stays inside the allowlist dir", () => {
    expect(isSafeTemplatePath("epub-genre.css")).toBe(true);
    expect(isSafeTemplatePath("sub/dir/custom.typ")).toBe(true);
    // In-bounds `..` that normalizes back inside the base is fine.
    expect(isSafeTemplatePath("sub/../epub-genre.css")).toBe(true);
  });

  it("rejects absolute URLs (SSRF / remote fetch vectors)", () => {
    expect(isSafeTemplatePath("http://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(isSafeTemplatePath("https://evil.example.com/x.css")).toBe(false);
    expect(isSafeTemplatePath("file:///etc/passwd")).toBe(false);
    expect(isSafeTemplatePath("ftp://host/x")).toBe(false);
    expect(isSafeTemplatePath("data:text/css;base64,Zm9v")).toBe(false);
  });

  it("rejects UNC paths (outbound SMB/NTLM)", () => {
    expect(isSafeTemplatePath("\\\\attacker\\share\\x.docx")).toBe(false);
    expect(isSafeTemplatePath("//attacker/share/x.docx")).toBe(false);
  });

  it("rejects absolute local paths and Windows drive paths", () => {
    expect(isSafeTemplatePath("/etc/passwd")).toBe(false);
    expect(isSafeTemplatePath("/app/.env")).toBe(false);
    expect(isSafeTemplatePath("C:\\Windows\\win.ini")).toBe(false);
  });

  it("rejects ../ traversal that escapes the allowlist dir", () => {
    expect(isSafeTemplatePath("../../../etc/passwd")).toBe(false);
    expect(isSafeTemplatePath("../secret.css")).toBe(false);
    // Sibling-prefix bypass (…/export-templates-evil) must not slip through.
    expect(isSafeTemplatePath("../export-templates-evil/x")).toBe(false);
  });
});

describe("resolveSafeTemplatePath (D-21 defensive resolver)", () => {
  it("returns null for empty and for every unsafe value", () => {
    expect(resolveSafeTemplatePath("")).toBeNull();
    expect(resolveSafeTemplatePath("http://evil/x.css")).toBeNull();
    expect(resolveSafeTemplatePath("/etc/passwd")).toBeNull();
    expect(resolveSafeTemplatePath("../../etc/passwd")).toBeNull();
    expect(resolveSafeTemplatePath("\\\\host\\share")).toBeNull();
  });

  it("returns an absolute path inside the allowlist for a safe value", () => {
    const out = resolveSafeTemplatePath("epub-genre.css");
    expect(out).toBe(resolve(TEMPLATE_ALLOWLIST_DIR, "epub-genre.css"));
    expect(out?.startsWith(resolve(TEMPLATE_ALLOWLIST_DIR) + sep)).toBe(true);
  });
});

describe("exportConfigSchema (D-21 PUT validation boundary)", () => {
  const base = getDefaultExportConfig("A Book");

  it("accepts the default config and safe relative custom paths", () => {
    expect(() => exportConfigSchema.parse(base)).not.toThrow();
    const safe = {
      ...base,
      customTemplates: {
        docxReference: "reference-genre.docx",
        epubCss: "epub-genre.css",
        typstTemplate: "typst-book.typ",
      },
      frontMatter: { ...base.frontMatter, coverImagePath: "cover.png" },
    };
    expect(() => exportConfigSchema.parse(safe)).not.toThrow();
  });

  it("rejects an SSRF URL in customTemplates.epubCss", () => {
    const bad = {
      ...base,
      customTemplates: {
        ...base.customTemplates,
        epubCss: "http://169.254.169.254/latest/meta-data/",
      },
    };
    expect(() => exportConfigSchema.parse(bad)).toThrow();
  });

  it("rejects an absolute local path in frontMatter.coverImagePath", () => {
    const bad = {
      ...base,
      frontMatter: { ...base.frontMatter, coverImagePath: "/etc/passwd" },
    };
    expect(() => exportConfigSchema.parse(bad)).toThrow();
  });

  it("rejects a UNC docxReference and a ../ typstTemplate", () => {
    const unc = {
      ...base,
      customTemplates: {
        ...base.customTemplates,
        docxReference: "\\\\attacker\\share\\ref.docx",
      },
    };
    expect(() => exportConfigSchema.parse(unc)).toThrow();

    const traversal = {
      ...base,
      customTemplates: {
        ...base.customTemplates,
        typstTemplate: "../../secret.typ",
      },
    };
    expect(() => exportConfigSchema.parse(traversal)).toThrow();
  });

  it("rejects bad paths through the partial update schema too", () => {
    const badUpdate = {
      customTemplates: {
        docxReference: "",
        epubCss: "https://evil.example.com/x.css",
        typstTemplate: "",
      },
    };
    expect(() => exportConfigUpdateSchema.parse(badUpdate)).toThrow();

    const goodUpdate = {
      customTemplates: {
        docxReference: "",
        epubCss: "epub-genre.css",
        typstTemplate: "",
      },
    };
    expect(() => exportConfigUpdateSchema.parse(goodUpdate)).not.toThrow();
  });
});
