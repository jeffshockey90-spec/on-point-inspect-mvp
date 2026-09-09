#!/usr/bin/env node
// Jarvis watcher — the piece that lets a post/tag "wake" Claude.
//
// The FLOW cloud can't reach into your machine, so this runs on YOUR side: it
// polls the Jarvis work queue through the bridge and, when there's a new
// message from Jeff or Jarvis that Claude hasn't answered, it invokes your
// LOCAL `claude` CLI to compose a reply and posts it back into the thread as
// "claude". Runs while your machine + this process are up.
//
// Usage:
//   node scripts/jarvis-watch.mjs                 # default: reply only when a message @claude-tags you
//   node scripts/jarvis-watch.mjs --mode all      # reply to any new Jeff/Jarvis message
//   node scripts/jarvis-watch.mjs --interval 20   # poll every 20s (default 30)
//
// Needs JARVIS_BRIDGE_TOKEN in .env.local and the `claude` CLI on PATH.

import { readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";

function loadEnv() {
  const env = { ...process.env };
  for (const file of [".env.local", ".env"]) {
    try {
      for (const line of readFileSync(file, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    } catch { /* ignore */ }
  }
  return env;
}

const env = loadEnv();
const token = env.JARVIS_BRIDGE_TOKEN;
const base = (env.JARVIS_BASE_URL || "https://app.flowinspect.app").replace(/\/$/, "");
if (!token) { console.error("Missing JARVIS_BRIDGE_TOKEN (.env.local)."); process.exit(1); }

const args = process.argv.slice(2);
const mode = (() => { const i = args.indexOf("--mode"); return i >= 0 ? args[i + 1] : "tag"; })(); // tag | all
const intervalSec = (() => { const i = args.indexOf("--interval"); return i >= 0 ? Number(args[i + 1]) : 30; })();
const STATE_FILE = ".jarvis-watch-state.json";

function loadState() { try { return JSON.parse(readFileSync(STATE_FILE, "utf8")); } catch { return {}; } }
function saveState(s) { try { writeFileSync(STATE_FILE, JSON.stringify(s)); } catch { /* ignore */ } }

const headers = { "Content-Type": "application/json", "x-jarvis-token": token };

async function fetchQueue() {
  const res = await fetch(`${base}/api/jarvis/bridge`, { headers });
  if (!res.ok) throw new Error(`bridge ${res.status}`);
  const data = await res.json();
  return data.threads || [];
}

async function postReply(threadId, body) {
  const res = await fetch(`${base}/api/jarvis/bridge`, {
    method: "POST", headers, body: JSON.stringify({ thread_id: threadId, body }),
  });
  return res.ok;
}

// Ask the LOCAL claude CLI to compose Claude's reply (text only — no tools, so
// it never hangs on a permission prompt). Returns the reply string.
function composeReply(thread) {
  const label = (a) => (a === "claude" ? "Claude" : a === "jarvis" ? "Jarvis" : a === "gpt" ? "GPT" : "Jeff");
  const transcript = (thread.messages || [])
    .map((m) => `${label(m.author)}: ${m.body}`)
    .join("\n\n");
  const prompt = `You are Claude, the developer on a 4-person team (Jeff = the owner, Jarvis = the AI ops agent, GPT = the strategist, you = Claude) working inside the FLOW app's "${thread.title}" thread. Read the thread and write YOUR next reply as Claude — concise, warm, honest, teammate voice. If it's a real dev task, say how you'd approach it and that you'll pick it up in a full session (you can't edit code from here). Output ONLY your reply text — no preamble, no markdown headers.\n\n--- THREAD ---\n${transcript}\n\n--- Write Claude's reply: ---`;

  return new Promise((resolve) => {
    // Windows needs the .exe (bare "claude" won't resolve); feed the prompt via
    // stdin so long/multi-line/quoted text can't break arg quoting.
    const bin = process.platform === "win32" ? "claude.exe" : "claude";
    let out = "";
    let err = "";
    let done = false;
    const finish = (val) => { if (!done) { done = true; resolve(val); } };
    let child;
    try {
      // Pass the prompt as an argument (spawn handles quoting with no shell, so
      // multi-line/quoted text is safe). Close stdin so the CLI doesn't wait on it.
      child = spawn(bin, ["-p", prompt], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      console.error("  ! couldn't start `claude`:", e.message);
      return finish("");
    }
    const killer = setTimeout(() => { try { child.kill(); } catch {} console.error("  ! claude timed out"); finish(out.trim()); }, 120000);
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("error", (e) => { clearTimeout(killer); console.error("  ! couldn't run `claude`:", e.message); finish(""); });
    child.on("close", (code) => {
      clearTimeout(killer);
      const text = out.trim();
      // Don't post CLI errors as if they were Claude's reply.
      if (/failed to authenticate|oauth|not authenticated|invalid api key|usage limit|please run .*login/i.test(text)) {
        console.error(`  ! claude auth/CLI error (not posting): ${text.slice(0, 160)}`);
        return finish("");
      }
      if (!text && code !== 0) console.error(`  ! claude exited ${code}: ${err.slice(0, 200)}`);
      finish(text);
    });
  });
}

function shouldAnswer(thread, state) {
  const msgs = thread.messages || [];
  if (!msgs.length) return null;
  const last = msgs[msgs.length - 1];
  if (last.author === "claude") return null;             // don't answer ourselves
  if (state[thread.id] === last.created_at) return null; // already handled this message
  if (mode === "tag" && !/@(claude|team)\b/i.test(String(last.body || ""))) return null;
  return last;
}

let running = false;
async function tick() {
  if (running) return;
  running = true;
  try {
    const threads = await fetchQueue();
    const state = loadState();
    for (const t of threads) {
      const trigger = shouldAnswer(t, state);
      if (!trigger) continue;
      console.log(`→ ${new Date().toLocaleTimeString()} replying in "${t.title}" (${t.id})`);
      const reply = await composeReply(t);
      if (reply) {
        const ok = await postReply(t.id, reply);
        console.log(ok ? "  ✓ posted" : "  ✗ post failed");
      }
      state[t.id] = trigger.created_at; // mark handled either way to avoid a retry storm
      saveState(state);
    }
  } catch (e) {
    console.error("  poll error:", e.message);
  } finally {
    running = false;
  }
}

console.log(`🤖⚡ Jarvis watcher up — polling ${base} every ${intervalSec}s, mode=${mode}. Ctrl+C to stop.`);
await tick();
setInterval(tick, Math.max(10, intervalSec) * 1000);
