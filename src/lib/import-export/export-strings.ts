/**
 * The boilerplate a finished book carries: the copyright page, the section
 * headings the product supplies, and the fallback chapter heading.
 *
 * H-6/H-7: this text was hardcoded English in every export. A Serbian writer's
 * finished novel came out with "All rights reserved.", "About the Author" and
 * — for any chapter he had not titled — "Chapter 7" sitting in the body and in
 * the table of contents. It is the last page of the book that is most obviously
 * not his.
 *
 * Keyed by the BOOK's language (what the prose is written in), not the
 * interface language: the book is the artifact, and it is read by people who
 * never see this app.
 */

export interface ExportStrings {
  /** Fallback chapter heading for an untitled chapter, with {n}. */
  chapter: string;
  /** Act divider heading, with {n}. */
  act: string;
  allRightsReserved: string;
  reproductionNotice: string;
  isbn: string;
  publishedBy: string;
  completeSeries: string;
  /** Series title-page line, with {n} for the book number. */
  bookNumber: string;
  aboutTheAuthor: string;
  alsoBy: string;
  acknowledgments: string;
}

const EN: ExportStrings = {
  chapter: "Chapter {n}",
  act: "Act {n}",
  allRightsReserved: "All rights reserved.",
  reproductionNotice:
    "No part of this publication may be reproduced, distributed, or transmitted in any form or by any means without the prior written permission of the author, except in the case of brief quotations embodied in critical reviews.",
  isbn: "ISBN",
  publishedBy: "Published by",
  completeSeries: "Complete Series",
  bookNumber: "Book {n}",
  aboutTheAuthor: "About the Author",
  alsoBy: "Also By",
  acknowledgments: "Acknowledgments",
};

const SR: ExportStrings = {
  chapter: "Poglavlje {n}",
  act: "Čin {n}",
  allRightsReserved: "Sva prava zadržana.",
  reproductionNotice:
    "Nijedan deo ove publikacije ne sme se reprodukovati, distribuirati niti prenositi u bilo kom obliku ili na bilo koji način bez prethodne pisane dozvole autora, osim kratkih citata u prikazima i kritikama.",
  isbn: "ISBN",
  publishedBy: "Izdaje",
  completeSeries: "Ceo serijal",
  bookNumber: "Knjiga {n}",
  aboutTheAuthor: "O autoru",
  alsoBy: "Od istog autora",
  acknowledgments: "Zahvalnice",
};

const DE: ExportStrings = {
  chapter: "Kapitel {n}",
  act: "Akt {n}",
  allRightsReserved: "Alle Rechte vorbehalten.",
  reproductionNotice:
    "Kein Teil dieser Veröffentlichung darf ohne vorherige schriftliche Genehmigung des Autors in irgendeiner Form vervielfältigt, verbreitet oder übertragen werden, ausgenommen kurze Zitate in Rezensionen.",
  isbn: "ISBN",
  publishedBy: "Verlag",
  completeSeries: "Gesamtausgabe",
  bookNumber: "Band {n}",
  aboutTheAuthor: "Über den Autor",
  alsoBy: "Ebenfalls erschienen",
  acknowledgments: "Danksagung",
};

const ES: ExportStrings = {
  chapter: "Capítulo {n}",
  act: "Acto {n}",
  allRightsReserved: "Todos los derechos reservados.",
  reproductionNotice:
    "Ninguna parte de esta publicación puede ser reproducida, distribuida ni transmitida en forma alguna ni por ningún medio sin el permiso previo por escrito del autor, salvo citas breves en reseñas críticas.",
  isbn: "ISBN",
  publishedBy: "Publicado por",
  completeSeries: "Serie completa",
  bookNumber: "Libro {n}",
  aboutTheAuthor: "Sobre el autor",
  alsoBy: "Del mismo autor",
  acknowledgments: "Agradecimientos",
};

const FR: ExportStrings = {
  chapter: "Chapitre {n}",
  act: "Acte {n}",
  allRightsReserved: "Tous droits réservés.",
  reproductionNotice:
    "Aucune partie de cette publication ne peut être reproduite, distribuée ou transmise sous quelque forme ou par quelque moyen que ce soit sans l'autorisation écrite préalable de l'auteur, à l'exception de brèves citations dans des critiques.",
  isbn: "ISBN",
  publishedBy: "Publié par",
  completeSeries: "Série complète",
  bookNumber: "Livre {n}",
  aboutTheAuthor: "À propos de l'auteur",
  alsoBy: "Du même auteur",
  acknowledgments: "Remerciements",
};

const RU: ExportStrings = {
  chapter: "Глава {n}",
  act: "Действие {n}",
  allRightsReserved: "Все права защищены.",
  reproductionNotice:
    "Никакая часть данного издания не может быть воспроизведена, распространена или передана в какой бы то ни было форме и какими бы то ни было средствами без предварительного письменного разрешения автора, за исключением кратких цитат в рецензиях.",
  isbn: "ISBN",
  publishedBy: "Издатель",
  completeSeries: "Полное собрание",
  bookNumber: "Книга {n}",
  aboutTheAuthor: "Об авторе",
  alsoBy: "Того же автора",
  acknowledgments: "Благодарности",
};

const ZH: ExportStrings = {
  chapter: "第 {n} 章",
  act: "第 {n} 幕",
  allRightsReserved: "版权所有。",
  reproductionNotice:
    "未经作者事先书面许可，不得以任何形式或任何方式复制、发行或传播本出版物的任何部分，评论中的简短引用除外。",
  isbn: "ISBN",
  publishedBy: "出版",
  completeSeries: "全系列",
  bookNumber: "第 {n} 册",
  aboutTheAuthor: "关于作者",
  alsoBy: "同一作者作品",
  acknowledgments: "致谢",
};

const TABLES: Record<string, ExportStrings> = {
  en: EN,
  sr: SR,
  "sr-Latn": SR,
  "sr-Cyrl": SR,
  de: DE,
  es: ES,
  fr: FR,
  ru: RU,
  zh: ZH,
};

/** The book's own boilerplate. Falls back to English for a language with none. */
export function getExportStrings(language?: string | null): ExportStrings {
  if (!language) return EN;
  return TABLES[language] ?? TABLES[language.split("-")[0]] ?? EN;
}

/** `Chapter 7` / `Poglavlje 7` / `第 7 章`. */
export function chapterHeading(n: number, language?: string | null): string {
  return getExportStrings(language).chapter.replace("{n}", String(n));
}

/** `Act 2` / `Čin 2`. */
export function actHeading(n: number, language?: string | null): string {
  return getExportStrings(language).act.replace("{n}", String(n));
}
