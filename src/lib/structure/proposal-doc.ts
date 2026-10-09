/**
 * Dev editor v2, phase A — the STRUCTURE_PROPOSAL document of a pass.
 *
 * The moves are the pass's deliverable; the document is their readable form.
 * In the live baseline the architect filed moves and never wrote the document,
 * the conductor took the pass for unfinished, and two more delegations filed
 * anew. `finishRestructureDelegation` closes that loop: it writes the document
 * from the moves when the architect did not, and tells the conductor, in the
 * delegation result, exactly what the pass holds and that it is complete.
 */

import { db } from "@/lib/db";
import { DocumentService } from "@/lib/documents/document-service";
import { MAX_MOVES_PER_PASS, formatPassLedger } from "./pass";

/** One move as the document reads it. */
export interface ProposalMove {
  id: string;
  kind: string;
  payload: string;
  reason: string;
  evidence: string | null;
  confidence: number | null;
  alternativeToId: string | null;
  status: string;
}

const PROPOSAL_MOVE_SELECT = {
  id: true,
  kind: true,
  payload: true,
  reason: true,
  evidence: true,
  confidence: true,
  alternativeToId: true,
  status: true,
} as const;

interface DocCopy {
  title: (book: string) => string;
  intro: string;
  kinds: Record<string, string>;
  chapter: string;
  chapters: string;
  at: string;
  toPosition: string;
  evidence: string;
  confidence: string;
  alternative: string;
  /** Opening and closing quotation marks of the language. */
  quotes: [string, string];
  /** Marks a move the commercial reading (phase D) motivated. */
  lensCommercial: string;
}

const COPY: Record<string, DocCopy> = {
  en: {
    title: (b) => `Structural proposal — ${b}`,
    intro: "Nothing changes until you accept a move. Each move can be undone after it is applied.",
    kinds: { reorder: "Move", renumber: "Renumber", merge: "Merge", split: "Split" },
    chapter: "chapter",
    chapters: "chapters",
    at: "at",
    toPosition: "to position",
    evidence: "Evidence",
    confidence: "Confidence",
    alternative: "Alternative (if you reject the move above)",
    quotes: ["\u201c", "\u201d"],
    lensCommercial: "Commercial reading",
  },
  sr: {
    title: (b) => `Strukturni predlog — ${b}`,
    intro: "Ništa se ne menja dok ne prihvatiš potez. Svaki primenjeni potez može da se poništi.",
    kinds: { reorder: "Premeštanje", renumber: "Prenumerisanje", merge: "Spajanje", split: "Razdvajanje" },
    chapter: "poglavlje",
    chapters: "poglavlja",
    at: "kod",
    toPosition: "na mesto",
    evidence: "Dokaz",
    confidence: "Sigurnost",
    alternative: "Alternativa (ako odbiješ potez iznad)",
    quotes: ["\u201e", "\u201c"],
    lensCommercial: "Komercijalno čitanje",
  },
  de: {
    title: (b) => `Strukturvorschlag — ${b}`,
    intro: "Nichts ändert sich, bevor Sie einen Schritt annehmen. Jeder angewandte Schritt lässt sich rückgängig machen.",
    kinds: { reorder: "Verschieben", renumber: "Neu nummerieren", merge: "Zusammenführen", split: "Teilen" },
    chapter: "Kapitel",
    chapters: "Kapitel",
    at: "bei",
    toPosition: "an Position",
    evidence: "Beleg",
    confidence: "Sicherheit",
    alternative: "Alternative (falls Sie den Schritt oben ablehnen)",
    quotes: ["\u201e", "\u201c"],
    lensCommercial: "Kommerzielle Lektüre",
  },
  es: {
    title: (b) => `Propuesta estructural — ${b}`,
    intro: "Nada cambia hasta que aceptes un movimiento. Cada movimiento aplicado se puede deshacer.",
    kinds: { reorder: "Mover", renumber: "Renumerar", merge: "Fusionar", split: "Dividir" },
    chapter: "capítulo",
    chapters: "capítulos",
    at: "en",
    toPosition: "a la posición",
    evidence: "Evidencia",
    confidence: "Confianza",
    alternative: "Alternativa (si rechazas el movimiento de arriba)",
    quotes: ["\u00ab", "\u00bb"],
    lensCommercial: "Lectura comercial",
  },
  fr: {
    title: (b) => `Proposition structurelle — ${b}`,
    intro: "Rien ne change tant que vous n’acceptez pas un mouvement. Chaque mouvement appliqué peut être annulé.",
    kinds: { reorder: "Déplacer", renumber: "Renuméroter", merge: "Fusionner", split: "Scinder" },
    chapter: "chapitre",
    chapters: "chapitres",
    at: "à",
    toPosition: "en position",
    evidence: "Preuve",
    confidence: "Confiance",
    alternative: "Alternative (si vous refusez le mouvement ci-dessus)",
    quotes: ["\u00ab\u00a0", "\u00a0\u00bb"],
    lensCommercial: "Lecture commerciale",
  },
  ru: {
    title: (b) => `Структурное предложение — ${b}`,
    intro: "Ничего не меняется, пока вы не примете шаг. Любой применённый шаг можно отменить.",
    kinds: { reorder: "Перемещение", renumber: "Перенумерация", merge: "Слияние", split: "Разделение" },
    chapter: "глава",
    chapters: "главы",
    at: "на",
    toPosition: "на позицию",
    evidence: "Обоснование",
    confidence: "Уверенность",
    alternative: "Альтернатива (если вы отклоните шаг выше)",
    quotes: ["\u00ab", "\u00bb"],
    lensCommercial: "Коммерческое чтение",
  },
  zh: {
    title: (b) => `结构调整建议 — ${b}`,
    intro: "在你接受某项调整之前，什么都不会改变。每项已应用的调整都可以撤销。",
    kinds: { reorder: "移动", renumber: "重新编号", merge: "合并", split: "拆分" },
    chapter: "章",
    chapters: "章",
    at: "于",
    toPosition: "到位置",
    evidence: "依据",
    confidence: "把握",
    alternative: "备选（如果你拒绝上面的调整）",
    quotes: ["\u201c", "\u201d"],
    lensCommercial: "商业化阅读",
  },
};

function copyFor(language: string): DocCopy {
  return COPY[language] ?? COPY.en;
}

function headline(move: ProposalMove, c: DocCopy): string {
  const kind = c.kinds[move.kind] ?? move.kind;
  try {
    const p = JSON.parse(move.payload) as {
      chapterNumbers?: number[];
      chapterNumber?: number;
      targetPosition?: number;
      anchorQuote?: string;
    };
    if (p.chapterNumbers?.length) {
      return `${kind}: ${c.chapters} ${p.chapterNumbers.join(" + ")}`;
    }
    const base = `${kind}: ${c.chapter} ${p.chapterNumber ?? "?"}`;
    if (move.kind === "split" && p.anchorQuote) {
      return `${base}, ${c.at} ${c.quotes[0]}${p.anchorQuote}${c.quotes[1]}`;
    }
    if (p.targetPosition) return `${base} ${c.toPosition} ${p.targetPosition}`;
    return base;
  } catch {
    return kind;
  }
}

function block(move: ProposalMove, c: DocCopy, heading: string): string {
  const lines = [heading, "", move.reason.trim()];
  try {
    if ((JSON.parse(move.payload) as { lens?: string }).lens === "commercial") {
      lines.splice(1, 0, "", `*${c.lensCommercial}*`);
    }
  } catch {
    // An unreadable payload carries no lens.
  }
  if (move.evidence?.trim()) lines.push("", `*${c.evidence}:* ${move.evidence.trim()}`);
  if (typeof move.confidence === "number") {
    lines.push("", `*${c.confidence}:* ${Math.round(move.confidence * 100)}%`);
  }
  return lines.join("\n");
}

/** The pass's moves as a readable document, alternatives under their primary. */
export function composeStructureProposal(args: {
  bookName: string;
  language: string;
  moves: readonly ProposalMove[];
  /** The commercial pass (phase D): the header says which reading this is. */
  commercial?: boolean;
}): string {
  const c = copyFor(args.language);
  const primaries = args.moves.filter((m) => !m.alternativeToId);
  const parts = [`# ${c.title(args.bookName)}`, ...(args.commercial ? ["", `*${c.lensCommercial}*`] : []), "", c.intro];
  primaries.forEach((m, i) => {
    parts.push("", block(m, c, `## ${i + 1}. ${headline(m, c)}`));
    for (const alt of args.moves.filter((a) => a.alternativeToId === m.id)) {
      parts.push("", block(alt, c, `### ${c.alternative}: ${headline(alt, c)}`));
    }
  });
  return parts.join("\n");
}

/**
 * What the conductor learns when a restructure delegation returns: the pass as
 * filed, and that it is complete. Writes STRUCTURE_PROPOSAL from the moves when
 * the architect did not write it in this delegation. A write failure is logged
 * and never fails the delegation — the moves are already on the writer's panel.
 */
export async function finishRestructureDelegation(args: {
  bookId: string;
  userId: string;
  passId: string;
  language: string;
  bookName: string;
  specialistDocumentIds: readonly string[];
  commercial?: boolean;
}): Promise<string> {
  // What still waits for the writer. A chat session can hold several runs; a
  // move the writer already applied is history, not part of the proposal.
  const moves: ProposalMove[] = await db.structureMove.findMany({
    where: {
      bookId: args.bookId,
      sessionId: args.passId,
      status: "pending",
    },
    select: PROPOSAL_MOVE_SELECT,
    orderBy: { createdAt: "asc" },
  });

  if (moves.length === 0) {
    return (
      "\n### Structural pass\nNo move was filed in this pass, so there is nothing for the writer " +
      "to decide yet. Tell the writer what the architect found instead of claiming a proposal."
    );
  }

  const wroteProposal =
    args.specialistDocumentIds.length > 0 &&
    (
      await db.document.findMany({
        where: { id: { in: [...args.specialistDocumentIds] }, bookId: args.bookId },
        select: { id: true, type: true },
      })
    ).some((d) => d.type === "STRUCTURE_PROPOSAL");

  if (!wroteProposal) {
    try {
      const content = composeStructureProposal({
        bookName: args.bookName,
        language: args.language,
        moves,
        commercial: args.commercial,
      });
      const title = copyFor(args.language).title(args.bookName);
      const docs = new DocumentService(args.userId, args.bookId);
      const existing = await docs.findByType("STRUCTURE_PROPOSAL");
      if (existing) {
        await docs.update(existing.id, content, title, "agent_write", "agent");
      } else {
        await docs.create("STRUCTURE_PROPOSAL", content, title, undefined, undefined, "agent");
      }
    } catch (err) {
      console.error("[structure] composing STRUCTURE_PROPOSAL failed", { bookId: args.bookId, err });
    }
  }

  const primaries = moves.filter((m) => !m.alternativeToId);
  const alternatives = moves.filter((m) => !!m.alternativeToId);
  return [
    "",
    "### Structural pass",
    formatPassLedger(primaries, alternatives),
    "",
    `The pass is complete: these ${primaries.length} move(s) (of at most ${MAX_MOVES_PER_PASS}) are on the ` +
      "writer's panel and in STRUCTURE_PROPOSAL. Do not delegate again for this pass. Present exactly " +
      "these moves, in this order, and nothing the architect did not file.",
  ].join("\n");
}
