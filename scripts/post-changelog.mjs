#!/usr/bin/env node
// Publish a changelog entry (which ALSO pushes all inspectors: "🚀 What's New").
// Auth is a shared secret so it can run from a deploy step / a session, not a
// browser login.
//
// Usage:
//   node scripts/post-changelog.mjs "<title>" "<body...>"
//   node scripts/post-changelog.mjs "" "<body...>"     # blank title -> auto version bump
//
// Requires CHANGELOG_ANNOUNCE_TOKEN (matched by the server). Reads .env.local /
// .env automatically. Target URL defaults to http://localhost:3000; override
// with CHANGELOG_POST_URL (e.g. https://app.flowinspect.app).

import { readFileSync } from "node:fs";

function loadEnv() {
  const env = { ...process.env };
  for (const file of [".env.local", ".env"]) {
    try {
      for (const line of readFileSync(file, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    } catch {
      /* file may not exist */
    }
  }
  return env;
}

const env = loadEnv();
const token = env.CHANGELOG_ANNOUNCE_TOKEN;
const base = (env.CHANGELOG_POST_URL || "http://localhost:3000").replace(/\/$/, "");

const title = process.argv[2] ?? "";
const body = process.argv.slice(3).join(" ").trim();

if (!token) {
  console.error("Missing CHANGELOG_ANNOUNCE_TOKEN (add it to .env.local and Vercel).");
  process.exit(1);
}
if (!body) {
  console.error('Usage: node scripts/post-changelog.mjs "<title|empty>" "<body text>"');
  process.exit(1);
}

const res = await fetch(`${base}/api/owner/changelog/create`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-announce-token": token },
  body: JSON.stringify({ title, body }),
});

const out = await res.json().catch(() => ({}));
if (res.ok && out.ok) {
  console.log(`✅ Posted "${out.entry?.title}" — inspectors pushed.`);
} else {
  console.error(`❌ Failed (${res.status}):`, out.error || out);
  process.exit(1);
}
