// Phase 0 — discovery: confirm connectivity/auth + learn current resource IDs.
import { getJson } from "./lib";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

async function main() {
  const state: Record<string, unknown> = {};

  // Health (public)
  const health = await getJson("p8", "/api/health");
  console.log("health:", health.status, health.text.slice(0, 200));

  for (const p of ["p1", "p2", "p3", "p5", "p8"]) {
    const books = await getJson(p, "/api/books");
    const list = Array.isArray(books.json) ? books.json : [];
    console.log(
      `books[${p}]: status=${books.status} count=${list.length}` +
        (list[0] ? ` first={id:${list[0].id}, name:${JSON.stringify(list[0].name)}, chapters:${list[0]._count?.chapters}}` : "")
    );
    state[`${p}_books_status`] = books.status;
    state[`${p}_books`] = list.map((b: any) => ({ id: b.id, name: b.name, chapters: b._count?.chapters, seriesId: b.seriesId }));
  }

  for (const p of ["p1", "p3"]) {
    const series = await getJson(p, "/api/series");
    const list = Array.isArray(series.json) ? series.json : series.json?.series ?? [];
    console.log(`series[${p}]: status=${series.status} count=${Array.isArray(list) ? list.length : "n/a"} raw=${series.text.slice(0, 160)}`);
    state[`${p}_series_status`] = series.status;
    state[`${p}_series_raw`] = series.text.slice(0, 400);
  }

  // p8 api keys (disclose masked only)
  const keys = await getJson("p8", "/api/settings/api-keys");
  console.log("p8 api-keys:", keys.status, keys.text.slice(0, 400));
  state["p8_apikeys_status"] = keys.status;
  state["p8_apikeys_raw"] = keys.text;

  writeFileSync(
    join("cowork", "bulletproof-qa-2026-07-17", "evidence", "p8-rita-rejudge", "api-traces", "_discovery.json"),
    JSON.stringify(state, null, 2),
    "utf8"
  );
}

main().catch((e) => {
  console.error("discovery failed:", e);
  process.exit(1);
});
