// Deterministic diacritic-heavy prose generator for P7 Bao (migrator writes
// LONG, cares about never losing a word). Each chapter carries unique ASCII
// sentinels (survive pandoc smart-quote typesetting) at START, three MIDs and
// END so truncation anywhere is detectable, plus heavy Unicode throughout.

// Diacritic / multi-script sentence pool. Straight quotes/apostrophes avoided
// so pandoc's smart-quote pass cannot perturb the comparison tokens.
const POOL = [
  "A ködös hajnalon Kőszeg várfala fölött szürke felhők gyűltek össze csendben.",
  "São Paulo é uma cidade onde a saudade pesa como chumbo no coração do migrante.",
  "Der Fährmann über die Ærø brachte uns übermüdet ans andere Ufer bei Sonnenaufgang.",
  "Naïve façades cañon çağlar boyunca ışıldadı ve rüzgâr fısıldadı eski öykuleri.",
  "Привет из далёкого севера где мороз рисует узоры на замёрзшем окне ночью.",
  "L umlaut Grüße reisen über Flüsse Brücke für Brücke bis zum Mündungsgebiet.",
  "Ægir og Þór vandrede gennem tågen mens måsen skreg over det grå Kattegat.",
  "Fjärran i öster glittrade ån medan björken skälvde för den kyliga östanvinden.",
  "Le cœur naïf du châtelain frémissait sous la lueur pâle d une bougie mourante.",
  "Zażółć gęślą jaźń powtarzał stary bard nim zniknął w mroku pradawnej puszczy.",
];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface GenChapter {
  number: number;
  title: string;
  content: string;
  wordCount: number;
  sentinels: string[]; // START, MID1, MID2, MID3, END
}

// Titles carry diacritics too (exercise heading + EPUB <title> + docx headings).
const TITLES = [
  "A Kőszegi Kézirat", "São Café és Ærø", "Übermüdet Brücke", "Çağlar Boyunca",
  "Далёкий Север", "Grüße vom Fluß", "Ægir og Þór", "Björken Skälver",
  "Le Cœur Naïf", "Zażółć Gęślą", "Fönix és Hamu", "Måne over Fjord",
  "Þingvellir Nótt", "Œuvre Inachevée", "Głębia Puszczy", "Rüzgârın Şarkısı",
];

export function genChapter(n: number, targetWords: number): GenChapter {
  const rnd = mulberry32(1000 + n);
  const tag = `Zk${String(n).padStart(2, "0")}`;
  const START = `${tag}Alpha`;
  const MID1 = `${tag}Mid1`;
  const MID2 = `${tag}Mid2`;
  const MID3 = `${tag}Mid3`;
  const END = `${tag}Omega`;
  const sentinels = [START, MID1, MID2, MID3, END];

  const words: string[] = [];
  words.push(START);
  const midPoints = [
    Math.floor(targetWords * 0.25),
    Math.floor(targetWords * 0.5),
    Math.floor(targetWords * 0.75),
  ];
  const midToks = [MID1, MID2, MID3];
  let mi = 0;
  while (words.length < targetWords - 1) {
    if (mi < midPoints.length && words.length >= midPoints[mi]) {
      words.push(midToks[mi]); mi++;
    }
    const sentence = POOL[Math.floor(rnd() * POOL.length)];
    for (const w of sentence.split(" ")) words.push(w);
  }
  // ensure any unplaced mids get in before END
  while (mi < midToks.length) { words.push(midToks[mi]); mi++; }
  words.push(END);

  const content = words.join(" ");
  const wc = content.split(/\s+/).filter(Boolean).length;
  return {
    number: n,
    title: TITLES[(n - 1) % TITLES.length] + ` (ch.${n})`,
    content,
    wordCount: wc,
    sentinels,
  };
}

export function genBook(chapters: number, wordsPerChapter: number): GenChapter[] {
  const out: GenChapter[] = [];
  for (let n = 1; n <= chapters; n++) out.push(genChapter(n, wordsPerChapter));
  return out;
}

// Book title: intentionally diacritic-heavy + em dash + parens to exercise the
// D-46 filename fold (must yield "Koszeg", never "Kszeg") and D-05 metadata.
export const BOOK_NAME = "The Kőszeg Manuscript — Bao Réjudge P7 (São Café Ærø)";
