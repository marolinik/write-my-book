import { describe, it, expect } from "vitest";
import { rewriteXhtmlTitleFromH1 } from "@/lib/import-export/export-pipeline";

describe("rewriteXhtmlTitleFromH1 (F10 EPUB per-file title)", () => {
  it("replaces the split-filename <title> with the first <h1> heading", () => {
    const xhtml =
      '<?xml version="1.0" encoding="utf-8"?>\n' +
      '<html xmlns="http://www.w3.org/1999/xhtml"><head>' +
      "<title>ch001.xhtml</title></head>" +
      '<body><h1 id="the-first-letter">The First Letter</h1><p>Body.</p></body></html>';
    const out = rewriteXhtmlTitleFromH1(xhtml);
    expect(out).toContain("<title>The First Letter</title>");
    expect(out).not.toContain("<title>ch001.xhtml</title>");
    // Body heading is untouched.
    expect(out).toContain('<h1 id="the-first-letter">The First Letter</h1>');
  });

  it("leaves files with no <h1> (e.g. nav/TOC) unchanged", () => {
    const nav =
      "<html><head><title>Contents</title></head>" +
      '<body><nav epub:type="toc"><ol><li>x</li></ol></nav></body></html>';
    expect(rewriteXhtmlTitleFromH1(nav)).toBe(nav);
  });

  it("decodes named entities from the heading and re-escapes for XML", () => {
    const xhtml =
      "<head><title>ch002.xhtml</title></head>" +
      "<body><h1>Ash &amp; Ember</h1></body>";
    const out = rewriteXhtmlTitleFromH1(xhtml);
    expect(out).toContain("<title>Ash &amp; Ember</title>");
  });

  it("decodes numeric entities in the heading", () => {
    const xhtml =
      "<head><title>ch003.xhtml</title></head>" +
      "<body><h1>Caf&#233;</h1></body>";
    const out = rewriteXhtmlTitleFromH1(xhtml);
    expect(out).toContain("<title>Café</title>");
  });

  it("strips nested inline markup and collapses whitespace in the heading", () => {
    const xhtml =
      "<head><title>ch004.xhtml</title></head>" +
      '<body><h1><span class="drop">The </span>\n  Arrival</h1></body>';
    const out = rewriteXhtmlTitleFromH1(xhtml);
    expect(out).toContain("<title>The Arrival</title>");
  });

  it("returns the input unchanged when the heading text is empty", () => {
    const xhtml =
      "<head><title>ch005.xhtml</title></head><body><h1></h1></body>";
    expect(rewriteXhtmlTitleFromH1(xhtml)).toBe(xhtml);
  });
});
