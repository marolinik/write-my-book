/**
 * Builds the D4 import fixture: a deterministic 8-chapter, ~40,000-word Markdown
 * manuscript with the SAME unicode stress profile as Gerald's canonical book
 * (Zürich / Trieste / Łódź / Kőszeg / Marseille / Novosibirsk, em dashes, curly
 * quotes, diacritics). This is Gerald's day-0 artefact: the book he already wrote,
 * in a file, that he needs to get into the product.
 *
 * Usage: npx tsx make-fixture.ts <outFile>
 */
import { writeFileSync } from "node:fs";

const out = process.argv[2];
if (!out) { console.error("usage: <outFile>"); process.exit(1); }

const TITLES = [
  "A Debt in Zürich",
  "The Trieste Signal",
  "The Łódź Ledger",
  "The Kőszeg Drop",
  "No Names in Marseille",
  "Ash on the Wire",
  "Novosibirsk, Cold",
  "Dead Reckoning",
];
const PLACES = ["Zürich", "Trieste", "Łódź", "Kőszeg", "Marseille", "Novosibirsk", "Genève", "Białystok"];
const NAMES = ["Marek", "Ilse", "Đorđe", "Söderberg", "Ana-Lucía", "Kovács", "Renée", "Þórunn"];

// Deterministic PRNG so the fixture is byte-reproducible.
let seed = 31_031;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];

function sentence(i: number): string {
  const forms = [
    `The ledger in ${pick(PLACES)} balanced — it always did, and that was the problem.`,
    `“${pick(NAMES)},” she said, “nobody signs a receipt for a thing like this.”`,
    `He counted the notes twice: once for the courier, once for the man who would kill the courier.`,
    `Rain came off the ${pick(PLACES)} rooftops in sheets, and the wire stayed silent for eleven minutes.`,
    `${pick(NAMES)} had a rule about doorways — never stand in one you have not measured.`,
    `The train out of ${pick(PLACES)} left at 06:14 and nobody on it was travelling under a true name.`,
    `She wrote the number on her wrist in pencil, then licked her thumb and made it a smudge.`,
    `Somewhere between ${pick(PLACES)} and ${pick(PLACES)}, the account stopped being an account and became a debt.`,
    `“You keep saying ‘we’,” ${pick(NAMES)} told him. “There has never been a we.”`,
    `The dead-drop was a hollow in a plane tree; the tree had been there longer than the country.`,
  ];
  return forms[i % forms.length];
}

const parts: string[] = [];
let words = 0;
for (let c = 0; c < 8; c++) {
  parts.push(`# Chapter ${c + 1}: ${TITLES[c]}`);
  parts.push("");
  for (let p = 0; p < 42; p++) {
    const para: string[] = [];
    for (let s = 0; s < 8; s++) para.push(sentence(Math.floor(rnd() * 10) + p + s));
    const text = para.join(" ");
    words += text.trim().split(/\s+/).length;
    parts.push(text);
    parts.push("");
  }
}
const md = parts.join("\n");
writeFileSync(out, md, "utf8");
console.log(`wrote ${out}: ${Buffer.byteLength(md, "utf8")} bytes, ~${words} words, 8 chapters`);
