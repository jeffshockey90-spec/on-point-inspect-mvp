#!/usr/bin/env node
// Claude's side of the 3-way. Lets a Claude Code session read the Jarvis work
// queue and post back into a thread as the "claude" author, through the
// token-gated bridge (/api/jarvis/bridge). This is how Claude joins the
// conversation in FLOW without being a hosted service.
//
// Setup: JARVIS_BRIDGE_TOKEN must be set (here in .env.local AND on Vercel).
// Base URL defaults to production; override with JARVIS_BASE_URL.
//
// Usage:
//   node scripts/jarvis.mjs list                         # show open/in-progress threads
//   node scripts/jarvis.mjs reply <threadId> "message"   # post a reply as Claude
//   node scripts/jarvis.mjs reply <threadId> "message" --status in_progress --commit <sha> --url <link>
//   node scripts/jarvis.mjs status <threadId> <status>   # open|in_progress|shipped|closed

import { readFileSync } from "node:fs";

function loadEnv() {
  const env = { ...process.env };
  for (const file of [".env.local", ".env"]) {
    try {
      for (const line of readFileSync(file, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    } catch { /* file may not exist */ }
  }
  return env;
}

const env = loadEnv();
const token = env.JARVIS_BRIDGE_TOKEN;
const base = (env.JARVIS_BASE_URL || "https://app.flowinspect.app").replace(/\/$/, "");

if (!token) {
  console.error("Missing JARVIS_BRIDGE_TOKEN (add it to .env.local and Vercel).");
  process.exit(1);
}

const headers = { "Content-Type": "application/json", "x-jarvis-token": token };

// Pull named flags (--flag value) out of an argv slice; return { flags, rest }.
function parseFlags(args) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i].startsWith("--")) { flags[args[i].slice(2)] = args[i + 1]; i += 1; }
    else rest.push(args[i]);
  }
  return { flags, rest };
}

const cmd = process.argv[2] || "list";

if (cmd === "list" || cmd === "queue") {
  const res = await fetch(`${base}/api/jarvis/bridge`, { headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { console.error(`❌ ${res.status}:`, data.error || data); process.exit(1); }
  const threads = data.threads || [];
  if (!threads.length) { console.log("Queue empty — nothing open."); process.exit(0); }
  for (const t of threads) {
    console.log(`\n● [${t.status}] ${t.title}\n  id: ${t.id}  severity: ${t.severity}  updated: ${t.updated_at}`);
    for (const m of t.messages || []) {
      console.log(`    ${m.author.padEnd(6)} ${new Date(m.created_at).toLocaleString()}: ${String(m.body).replace(/\s+/g, " ").slice(0, 220)}`);
    }
  }
  console.log("");
  process.exit(0);
}

if (cmd === "reply") {
  const { flags, rest } = parseFlags(process.argv.slice(3));
  const threadId = rest[0];
  const body = rest.slice(1).join(" ");
  if (!threadId || !body) { console.error('Usage: jarvis.mjs reply <threadId> "message" [--status s] [--commit sha] [--url link]'); process.exit(1); }
  const meta = {};
  if (flags.commit) meta.commit = flags.commit;
  if (flags.url) meta.url = flags.url;
  const payload = { thread_id: threadId, body };
  if (flags.status) payload.status = flags.status;
  if (Object.keys(meta).length) payload.meta = meta;
  const res = await fetch(`${base}/api/jarvis/bridge`, { method: "POST", headers, body: JSON.stringify(payload) });
  const data = await res.json().catch(() => ({}));
  if (res.ok && data.ok) console.log("✅ Posted as Claude.");
  else { console.error(`❌ ${res.status}:`, data.error || data); process.exit(1); }
  process.exit(0);
}

if (cmd === "status") {
  const threadId = process.argv[3];
  const status = process.argv[4];
  if (!threadId || !status) { console.error("Usage: jarvis.mjs status <threadId> <open|in_progress|shipped|closed>"); process.exit(1); }
  const res = await fetch(`${base}/api/jarvis/bridge`, { method: "POST", headers, body: JSON.stringify({ action: "status", thread_id: threadId, status }) });
  const data = await res.json().catch(() => ({}));
  if (res.ok && data.ok) console.log(`✅ Thread → ${status}.`);
  else { console.error(`❌ ${res.status}:`, data.error || data); process.exit(1); }
  process.exit(0);
}

console.error(`Unknown command: ${cmd}. Use: list | reply | status`);
process.exit(1);
