// Token Launch Radar — the entry's program.
//
// Reads the frozen snapshot, builds the radar with lib/model.ts, and writes
// everything the gate checks into the output directory:
//
//   board.json      the ranked board (rows carry the model behind each rank)
//   data.js         the same figures, as window.RADAR, for the dashboard page
//   dashboard/      a copy of this repository's dashboard/
//   screenshots/    a copy of this repository's screenshots/
//   dossier.json    buildDossier's dossier of dashboard/ and screenshots/
//
// Run it as the kit's README does:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
//
// With no --input it reads /input/snapshot.json, and with no
// MAKEFUN_OUTPUT_DIR it writes /output, as the grader runs it. Every run
// writes the same bytes: the sort orders are fixed, ties break on slug, and
// nothing here reads the clock, the environment or any file outside the
// snapshot and this repository.

import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-board.ts';
import { buildRadar } from './lib/model.ts';
import type { Snapshot } from './lib/model.ts';

/** This repository's root: the directory this file lives in. */
const ROOT = dirname(fileURLToPath(import.meta.url));

/** The value of a --name argument, or null when it is not given. */
function flagValue(name: string): string | null {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === name && i + 1 < args.length) return args[i + 1]!;
    if (args[i]!.startsWith(`${name}=`)) return args[i]!.slice(name.length + 1);
  }
  return null;
}

const inputPath = flagValue('--input') ?? '/input/snapshot.json';
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const snapshot = JSON.parse(readFileSync(inputPath, 'utf8')) as Snapshot;
const radar = buildRadar(snapshot);

mkdirSync(outDir, { recursive: true });

// The board: one row per launch candidate, ranked by implied value. The
// model figures ride along as extra keys so the board is self-describing;
// the gate reads slug, name, rank, implied_value_usd and farm_steps.
const board = {
  as_of: snapshot.as_of,
  floor_usd: snapshot.floor_usd,
  rows: radar.rows.map((row) => ({
    slug: row.slug,
    name: row.name,
    rank: row.rank,
    implied_value_usd: row.implied_value_usd,
    farm_steps: row.farm_steps,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    age_days: row.age_days,
    category_multiple: row.category_multiple,
    multiple_samples: row.multiple_samples,
    multiple_source: row.multiple_source,
    growth_multiplier: row.growth_multiplier,
    maturity_multiplier: row.maturity_multiplier,
    watchlist: row.watchlist,
  })),
};
writeFileSync(join(outDir, 'board.json'), `${JSON.stringify(board, null, 2)}\n`, 'utf8');

// The dashboard's data, as one global beside the page. It carries the same
// rows as board.json (same numbers, same order), the live-token table that
// calibrates the multiples, the set-aside table with its reasons, and the
// calibration table — so the page can recompute every row from the figures
// it shows and the reader can check the model behind any rank.
const payload = {
  asOf: snapshot.as_of,
  floorUsd: snapshot.floor_usd,
  globalMedian: radar.globalMedian,
  globalSamples: radar.globalSamples,
  board: radar.rows,
  live: radar.live,
  setAside: radar.setAside,
  calibration: radar.calibration,
};
writeFileSync(join(outDir, 'data.js'), `window.RADAR = ${JSON.stringify(payload)};\n`, 'utf8');

// The page and its screenshots, copied whole into the output.
cpSync(join(ROOT, 'dashboard'), join(outDir, 'dashboard'), { recursive: true });
cpSync(join(ROOT, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });

// The dossier the judge reads: the dashboard's source plus the screenshots,
// exactly as buildDossier writes them. The gate compares these bytes.
writeFileSync(join(outDir, 'dossier.json'), buildDossier(outDir, { text_max_bytes: 65_536 }));

console.log(
  `radar: ${radar.rows.length} board rows, ${radar.live.length} live rows, ` +
    `${radar.setAside.length} set aside, dossier ${join(outDir, 'dossier.json')}`,
);
