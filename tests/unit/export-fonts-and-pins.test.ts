// Wave 4 ruling, D13: the production image had no CJK, Arabic or Devanagari
// fonts, so a PDF in zh/ja/ko/ar/hi printed missing-glyph boxes. P2-62: base
// images floated (node:22-alpine, postgres:16-alpine, neo4j:5-community), the
// Typst tarball on the export path was downloaded with no checksum, and the
// repo named no Node version. The image now installs the Noto families each
// language's PDF names, Typst falls back through them per glyph, and every
// image and tool is pinned.
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getExportFormatConfig } from "@/lib/import-export/language-config";

const ROOT = join(__dirname, "..", "..");
const read = (file: string) => readFileSync(join(ROOT, file), "utf-8");

/** Alpine 3.24 community packages and the families they ship (pkgs.alpinelinux.org, 11-12). */
const FONT_PACKAGES: Record<string, string[]> = {
  "font-noto-cjk": ["Noto Serif CJK SC", "Noto Serif CJK JP", "Noto Serif CJK KR", "Noto Sans CJK SC"],
  "font-noto-naskh-arabic": ["Noto Naskh Arabic"],
  "font-noto-arabic": ["Noto Sans Arabic"],
  "font-noto-devanagari": ["Noto Serif Devanagari", "Noto Sans Devanagari"],
};

describe("PDF fonts for every offered script", () => {
  const dockerfile = read("Dockerfile");

  it.each(["zh", "ja", "ko", "ar", "hi"])("%s names a font the image installs", (lang) => {
    const font = getExportFormatConfig(lang).bodyFont;
    const pkg = Object.entries(FONT_PACKAGES).find(([, families]) => families.includes(font))?.[0];
    expect(pkg, `${lang}: ${font}`).toBeTruthy();
    expect(dockerfile).toContain(pkg!);
  });

  it("the Typst template falls back through a font for each script", () => {
    const template = read("export-templates/typst-book.typ");
    for (const family of ["Noto Serif CJK SC", "Noto Naskh Arabic", "Noto Sans Arabic", "Noto Serif Devanagari"]) {
      expect(template).toContain(`"${family}"`);
    }
    expect(template).toMatch(/font: \(mainfont,/);
  });

  it("CI renders a page in each script inside the export-tools stage", () => {
    expect(dockerfile).toMatch(/AS export-tools/);
    expect(existsSync(join(ROOT, "scripts/check-export-fonts.sh"))).toBe(true);
    const ci = read(".github/workflows/ci.yml");
    expect(ci).toMatch(/--target export-tools/);
    expect(ci).toMatch(/check-export-fonts\.sh/);
  });
});

describe("pinned images and tools (P2-62)", () => {
  it("both Dockerfiles take node 22 by exact version and digest", () => {
    for (const file of ["Dockerfile", "Dockerfile.worker"]) {
      expect(read(file), file).toMatch(/^FROM node:22\.\d+-alpine3\.\d+@sha256:[0-9a-f]{64} AS base/m);
    }
  });

  it("the Typst download is checked against its checksum", () => {
    expect(read("Dockerfile")).toMatch(/sha256sum -c/);
  });

  it("the compose images name an exact version", () => {
    const compose = read("docker-compose.yml");
    for (const floating of ["postgres:16-alpine", "redis:7-alpine", "neo4j:5-community"]) {
      expect(compose).not.toContain(`image: ${floating}`);
    }
    expect(compose).toMatch(/image: postgres:16\.\d+-alpine/);
    expect(compose).toMatch(/image: redis:7\.\d+\.\d+-alpine/);
    expect(compose).toMatch(/image: neo4j:5\.\d+\.\d+-community/);
  });

  it("the repo names Node 22", () => {
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.engines?.node).toBe("22.x");
    expect(pkg.devDependencies["@types/node"]).toMatch(/^\^22/);
    expect(read(".nvmrc").trim()).toBe("22");
  });
});
