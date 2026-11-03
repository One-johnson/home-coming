/**
 * Stamp the `open` / `live` mirror fields on rows written before they existed.
 *
 * The desk, the rooming list and the review queue read live rows through
 * `by_open` / `by_live`, and Convex cannot index a missing field. Any row
 * without the mirror is invisible to those queries — which is what makes the
 * arrival desk report nobody assigned and nobody checked in while the records
 * sit in the database.
 *
 * `agcOpenFlags:backfill` patches one page per call because a single transaction
 * may read at most 4,096 documents, and production is larger than that. This
 * runner walks each table page by page and stops when the table reports done.
 *
 *   node scripts/backfill-open-mirrors.mjs          # dev deployment
 *   node scripts/backfill-open-mirrors.mjs --prod   # production
 *
 * Safe to re-run: a second pass patches nothing.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";

const TABLES = ["assignments", "checkIns", "flags"];
const prod = process.argv.includes("--prod");
/**
 * Run the CLI through node directly: going through a shell mangles the JSON
 * argument (Windows strips its quotes), which the CLI then fails to parse.
 */
const convexBin = path.resolve("node_modules/convex/bin/main.js");

function runPage(table, cursor) {
  const args = JSON.stringify(cursor ? { table, cursor } : { table });
  const result = spawnSync(
    process.execPath,
    [
      convexBin,
      "run",
      "agcOpenFlags:backfill",
      ...(prod ? ["--prod"] : []),
      args,
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(
      `backfill failed for ${table}${cursor ? ` (cursor ${cursor})` : ""}:\n${
        result.stderr || result.stdout
      }`,
    );
  }
  const out = result.stdout ?? "";
  const start = out.indexOf("{");
  const end = out.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error(`no JSON in convex run output:\n${out}`);
  }
  return JSON.parse(out.slice(start, end + 1));
}

let failed = false;
for (const table of TABLES) {
  let cursor;
  let patched = 0;
  let pages = 0;
  try {
    for (;;) {
      const page = runPage(table, cursor);
      pages += 1;
      patched += page.patched;
      if (page.isDone) break;
      if (!page.cursor) throw new Error(`${table}: page without a cursor`);
      cursor = page.cursor;
    }
    console.log(
      `${table}: ${patched} row(s) stamped over ${pages} page(s) — done`,
    );
  } catch (err) {
    failed = true;
    console.error(`${table}: ${err instanceof Error ? err.message : err}`);
    break;
  }
}

if (failed) process.exit(1);
console.log(
  `\nMirrors are set for ${prod ? "production" : "the dev deployment"}. ` +
    "Confirm with: npx convex run agcOpenFlags:verify" +
    (prod ? " --prod" : ""),
);
