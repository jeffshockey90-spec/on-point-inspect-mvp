#!/usr/bin/env node
// HTML-level report golden master (MANUAL — for Tier-2 refactor day).
//
// The committed logic-layer net is lib/report/reportGoldenMaster.test.ts (runs
// in CI, no server). THIS script is the complementary markup net: it fetches
// the actually-rendered HTML of each client-facing report surface for one
// sample inspection, strips the volatile bits (Next.js flight data, signed-URL
// query strings, nonces, timestamps), and diffs against a saved baseline — so a
// JSX/layout change during the environmental / Tier-2 consolidation shows up.
//
// It is NOT in CI: it needs a running dev server and a real share-token URL,
// and its baseline (report-golden/) is gitignored. I have not been able to
// smoke-test it against a live server in this session — treat the normalization
// below as a starting point and tune it for your pages on the day you use it.
//
// USAGE:
//   1. Start the app:  npm run dev   (or point BASE at a deployed URL)
//   2. Put the share-token paths for ONE sample inspection in PATHS below
//      (use a demo inspection via /api/demo-reports/create so there is no PII).
//   3. Baseline (before refactor):   node scripts/report-golden-master.mjs --save
//   4. After each refactor step:     node scripts/report-golden-master.mjs
//      -> prints OK or a unified-ish diff per surface; exit code 1 on any diff.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE || "http://localhost:3000";
const OUT = "report-golden";

// Fill these with your sample inspection's no-login share-token paths.
const PATHS = [
  // "/share/<SHARE_TOKEN>",
  // "/reports/<SHARE_TOKEN>/print",
  // "/environmental-share/<ID_OR_TOKEN>",
];

const save = process.argv.includes("--save");

// Remove the parts of Next.js HTML that change every build/request but carry no
// report content, so a diff reflects a real rendering change.
function normalize(html) {
  return html
    // Next.js streamed flight payload (self.__next_f.push([...]))
    .replace(/self\.__next_f\.push\(\[[\s\S]*?\]\)/g, "__NEXT_FLIGHT__")
    // __NEXT_DATA__ / other inline JSON script blocks
    .replace(/<script[^>]*>[\s\S]*?<\/script>/g, "__SCRIPT__")
    // nonces + Next build id
    .replace(/nonce="[^"]*"/g, 'nonce=""')
    .replace(/\/_next\/static\/[^"']+/g, "/_next/static/__HASH__")
    // Supabase signed-URL query strings (token + expiry change every request)
    .replace(/([?&])(token|X-Amz-[^=]+|Expires|expires_at)=[^"'&\s]+/g, "$1$2=__SIG__")
    // ISO timestamps
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^"'\s<]*/g, "__TS__")
    // collapse whitespace
    .replace(/\s+/g, " ")
    .trim();
}

function fileFor(path) {
  return join(OUT, path.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") + ".html");
}

async function run() {
  if (PATHS.length === 0) {
    console.error("No PATHS configured. Edit scripts/report-golden-master.mjs and add your sample inspection's share-token paths.");
    process.exit(2);
  }
  if (save) mkdirSync(OUT, { recursive: true });

  let anyDiff = false;
  for (const path of PATHS) {
    const url = BASE + path;
    let html;
    try {
      const res = await fetch(url);
      html = normalize(await res.text());
    } catch (err) {
      console.error(`FETCH FAILED ${url}: ${err.message}`);
      anyDiff = true;
      continue;
    }
    const file = fileFor(path);
    if (save) {
      writeFileSync(file, html);
      console.log(`saved  ${path}  (${html.length} bytes)`);
      continue;
    }
    if (!existsSync(file)) {
      console.error(`NO BASELINE for ${path} — run with --save first.`);
      anyDiff = true;
      continue;
    }
    const baseline = readFileSync(file, "utf8");
    if (baseline === html) {
      console.log(`OK     ${path}`);
    } else {
      anyDiff = true;
      console.error(`DIFF   ${path}`);
      // Show the first differing window so the change is visible without a tool.
      let i = 0;
      while (i < baseline.length && i < html.length && baseline[i] === html[i]) i++;
      const from = Math.max(0, i - 80);
      console.error("  baseline: …" + baseline.slice(from, i + 120) + "…");
      console.error("  current : …" + html.slice(from, i + 120) + "…");
    }
  }
  process.exit(anyDiff ? 1 : 0);
}

run();
