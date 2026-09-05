#!/usr/bin/env node
// Fails if a themed UI file uses a HARDCODED hex color in a Tailwind arbitrary
// color utility (bg-[#..], text-[#..], border-[#..], via-[#..], etc.). Those
// don't flip with the light/dark theme tokens (the fl- CSS vars), which is
// exactly how light mode ends up broken. Design rule: never hard-code a color
// in a class — route through an fl- design token instead. (UX audit item #2.)
//
// Intentionally-fixed-theme surfaces are allowlisted below (PDF/print, email,
// the marketing site, standalone error/payment pages that render before the
// app theme, and canvas/chart components that pass real color values, not
// theme surfaces).
//
// Usage:  node scripts/check-hardcoded-colors.mjs
// Exit 1 (with a list) if any new offender appears. Wire into a pre-commit hook.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["components", "app"];

// Files/paths whose colors are legitimately fixed (not theme-driven).
const ALLOW = [
  /[\\/]print[\\/]/i,
  /print\.tsx$/i,
  /pdf/i,
  /email/i, // email HTML is intentionally light
  /MarketingHomepage/i,
  /marketing-images/i,
  /global-error\.tsx$/i,
  /not-found\.tsx$/i,
  /payment-success/i,
  /payment-cancelled/i,
  /PhotoMarkupEditor\.tsx$/i, // canvas pen colors
  /DashboardTrends\.tsx$/i, // chart series colors
  /ScheduleCalendar\.tsx$/i, // FullCalendar cell overrides
  /SignaturePad\.tsx$/i, // canvas ink
];

// Tailwind arbitrary color utilities with a raw hex — the theme-breaking pattern.
const OFFENDER =
  /\b(?:bg|text|border|ring|from|via|to|fill|stroke|shadow|outline|divide|placeholder|caret|accent|decoration)-\[#[0-9a-fA-F]{3,8}\]/g;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      walk(p, out);
    } else if (/\.(tsx|ts)$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

const offenders = [];
for (const d of SCAN_DIRS) {
  const abs = join(ROOT, d);
  let files;
  try {
    files = walk(abs);
  } catch {
    continue;
  }
  for (const file of files) {
    const rel = relative(ROOT, file).split(sep).join("/");
    if (ALLOW.some((re) => re.test(rel))) continue;
    const src = readFileSync(file, "utf8");
    const lines = src.split("\n");
    lines.forEach((line, i) => {
      const m = line.match(OFFENDER);
      if (m) offenders.push({ file: rel, line: i + 1, hits: [...new Set(m)] });
    });
  }
}

if (offenders.length === 0) {
  console.log("✅ No hardcoded Tailwind hex colors in themed UI.");
  process.exit(0);
}

console.error(`❌ ${offenders.length} hardcoded color(s) in themed UI — use fl- design tokens so light/dark work:\n`);
for (const o of offenders) {
  console.error(`  ${o.file}:${o.line}  ${o.hits.join("  ")}`);
}
console.error(
  `\nRule: never hard-code a hex in a class. Route through the fl- design tokens.\n` +
    `If a file is a genuinely fixed-theme surface (PDF/print/email/marketing), add it to ALLOW in scripts/check-hardcoded-colors.mjs.`,
);
process.exit(1);
