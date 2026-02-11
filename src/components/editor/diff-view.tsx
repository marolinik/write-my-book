"use client";

interface DiffViewProps {
  content: string;
  oldContent?: string;
}

/**
 * Renders content or a side-by-side diff.
 * When oldContent is provided, shows line-based diff.
 * When only content is provided, renders it as plain text.
 */
export function DiffView({ content, oldContent }: DiffViewProps) {
  if (!oldContent) {
    return (
      <pre className="text-sm font-serif whitespace-pre-wrap p-4 leading-relaxed">
        {content}
      </pre>
    );
  }

  const diff = computeSimpleDiff(oldContent, content);

  return (
    <div className="text-sm font-mono p-4 space-y-0">
      {diff.map((line, i) => (
        <div
          key={i}
          className={
            line.type === "added"
              ? "diff-added px-2 py-0.5"
              : line.type === "removed"
                ? "diff-removed px-2 py-0.5"
                : "px-2 py-0.5"
          }
        >
          <span className="inline-block w-6 text-right mr-3 text-muted-foreground select-none">
            {line.type === "removed" ? "-" : line.type === "added" ? "+" : " "}
          </span>
          {line.content}
        </div>
      ))}
    </div>
  );
}

type LineDiff = { type: "added" | "removed" | "unchanged"; content: string };

function computeSimpleDiff(oldText: string, newText: string): LineDiff[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");

  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const result: LineDiff[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({ type: "unchanged", content: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: "added", content: newLines[j - 1] });
      j--;
    } else {
      result.unshift({ type: "removed", content: oldLines[i - 1] });
      i--;
    }
  }

  return result;
}
