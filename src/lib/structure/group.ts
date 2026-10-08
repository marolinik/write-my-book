import type { StructureMove } from "./types";

/** One primary move and the alternatives filed for it. */
export interface MoveGroup {
  move: StructureMove;
  alternatives: StructureMove[];
}

const byFiling = (a: StructureMove, b: StructureMove) =>
  new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();

/**
 * The pass as the chat presents it: primaries in filing order, each with its
 * alternatives. An alternative whose primary is no longer listed (the writer
 * rejected it) stands on its own, because it is now the choice on the table.
 */
export function groupMoves(moves: readonly StructureMove[]): MoveGroup[] {
  const sorted = [...moves].sort(byFiling);
  const listed = new Set(sorted.map((m) => m.id));
  const isNested = (m: StructureMove) => !!m.alternativeToId && listed.has(m.alternativeToId);
  return sorted
    .filter((m) => !isNested(m))
    .map((m) => ({ move: m, alternatives: sorted.filter((a) => a.alternativeToId === m.id) }));
}
