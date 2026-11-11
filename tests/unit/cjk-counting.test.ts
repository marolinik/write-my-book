// P2-47 / P2-43: zh and ja are offered book languages, but every counter split
// on whitespace, so 3,000 Japanese characters counted as one word (status bar,
// targets, pacing, the Free AI gate), the chunker returned a Chinese chapter
// as one oversized window, and embeddings were truncated by characters, which
// for CJK overruns the model's token limit. Counting now follows word
// processors (each Han or kana character is a word), windows split on CJK
// sentence ends, and truncation is by estimated tokens.
import { describe, it, expect } from "vitest";
import { countWords } from "@/lib/utils";
import { chunkChapterContent } from "@/lib/vector/chunker";
import { truncateForEmbedding, EMBEDDING_TOKEN_BUDGET } from "@/lib/vector/embeddings";
import { estimateTextTokens } from "@/lib/text/cjk";

const JA_SENTENCE = "これは日本語の文章です。"; // 11 counted characters + 。
const ZH_SENTENCE = "她把信放进抽屉里，然后关上了灯。"; // 14 Han characters + punctuation

describe("countWords", () => {
  it("counts each Han or kana character as a word, as word processors do", () => {
    const ja = JA_SENTENCE.repeat(250); // 3,000 characters
    expect(countWords(ja)).toBe(11 * 250);
    expect(countWords(ZH_SENTENCE)).toBe(14);
  });

  it("leaves space-delimited languages as they were", () => {
    expect(countWords("The quick brown fox")).toBe(4);
    expect(countWords("안녕하세요 세계")).toBe(2);
    expect(countWords("Ovo je **srpski** tekst.")).toBe(4);
  });

  it("adds both in mixed text", () => {
    expect(countWords("Hello 世界")).toBe(3);
  });
});

describe("chunking a Chinese chapter", () => {
  it("splits it into several windows within the token budget", () => {
    const chapter = ZH_SENTENCE.repeat(200); // ~2,800 Han characters, no spaces
    const chunks = chunkChapterContent(chapter, "b1", 1, { maxTokens: 400, overlapTokens: 50 });
    expect(chunks.length).toBeGreaterThan(5);
    for (const chunk of chunks) expect(estimateTextTokens(chunk.text)).toBeLessThanOrEqual(400);
    expect(chunks[0].text.startsWith("她把信")).toBe(true);
  });

  it("keeps English chunking as it was", () => {
    const words = Array.from({ length: 1000 }, (_, i) => `word${i}`).join(" ");
    const chunks = chunkChapterContent(words, "b1", 1, { maxTokens: 400, overlapTokens: 50 });
    expect(chunks[0].text.split(" ").length).toBe(Math.floor(400 / 1.3));
  });
});

describe("truncateForEmbedding", () => {
  it("cuts by estimated tokens, so Chinese stays under the model's limit", () => {
    const zh = ZH_SENTENCE.repeat(1000); // ~16,000 characters
    const cut = truncateForEmbedding(zh);
    expect(estimateTextTokens(cut)).toBeLessThanOrEqual(EMBEDDING_TOKEN_BUDGET);
    expect(cut.length).toBeLessThan(8191);
  });

  it("no longer cuts English at 8,191 characters", () => {
    const en = "word ".repeat(4000); // 20,000 characters, ~5,000 tokens
    expect(truncateForEmbedding(en)).toBe(en);
  });
});
