import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes with conflict resolution. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Count words in a markdown/text string. */
export function countWords(text: string): number {
  return text
    .replace(/```[\s\S]*?```/g, "") // strip code blocks
    .replace(/[#*_~`>|-]/g, "") // strip markdown syntax
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

/** Generate an S3 prefix for a book. */
export function generateS3Prefix(userId: string, bookId: string): string {
  return `${userId}/${bookId}`;
}

/** Generate an S3 prefix for a series book. */
export function generateSeriesS3Prefix(
  userId: string,
  seriesId: string,
  bookNumber: number
): string {
  return `${userId}/${seriesId}/books/book-${String(bookNumber).padStart(2, "0")}`;
}

/** Generate an S3 prefix for series-level documents. */
export function generateSeriesDocsPrefix(
  userId: string,
  seriesId: string
): string {
  return `${userId}/${seriesId}/series`;
}

/** Format a token count for display (e.g., 1234 → "1.2K", 1234567 → "1.2M"). */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
