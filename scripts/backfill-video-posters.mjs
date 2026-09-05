import { readFileSync, writeFileSync, unlinkSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import ffmpegPath from "ffmpeg-static";

function loadEnv() {
  const env = { ...process.env };
  for (const file of [".env.local", ".env"]) {
    try {
      for (const line of readFileSync(file, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    } catch {}
  }
  return env;
}

const env = loadEnv();
const BUCKET = "inspection-photos";
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: vids, error } = await admin
  .from("photos")
  .select("id, file_path, thumbnail_path, thumbnail_url, is_video")
  .eq("is_video", true);
if (error) { console.error(error); process.exit(1); }

const missing = vids.filter((v) => v.file_path && !v.thumbnail_path && !v.thumbnail_url);
console.log(`Backfilling posters for ${missing.length} videos...\n`);

let ok = 0, fail = 0;

function extractFrame(inPath, outPath) {
  // Try 1s in; fall back to the very first frame for short clips.
  for (const ss of ["00:00:01", "00:00:00"]) {
    try {
      execFileSync(ffmpegPath, [
        "-y", "-ss", ss, "-i", inPath, "-frames:v", "1",
        "-vf", "scale='min(1200,iw)':-2", "-q:v", "4", outPath,
      ], { stdio: "ignore" });
      if (statSync(outPath).size > 0) return true;
    } catch {}
  }
  return false;
}

for (let i = 0; i < missing.length; i++) {
  const v = missing[i];
  const tag = `[${i + 1}/${missing.length}] id=${v.id}`;
  const tmpVid = join(tmpdir(), `vid_${v.id}.mp4`);
  const tmpJpg = join(tmpdir(), `vid_${v.id}.jpg`);
  try {
    const { data: file, error: dlErr } = await admin.storage.from(BUCKET).download(v.file_path);
    if (dlErr || !file) { console.log(`${tag} download FAILED: ${dlErr?.message || "no file"}`); fail++; continue; }
    writeFileSync(tmpVid, Buffer.from(await file.arrayBuffer()));

    if (!extractFrame(tmpVid, tmpJpg)) { console.log(`${tag} frame extract FAILED`); fail++; continue; }
    const jpg = readFileSync(tmpJpg);

    const thumbPath = `${v.file_path}.thumb.jpg`;
    const { error: upErr } = await admin.storage.from(BUCKET).upload(thumbPath, jpg, {
      contentType: "image/jpeg", upsert: true,
    });
    if (upErr) { console.log(`${tag} upload FAILED: ${upErr.message}`); fail++; continue; }

    const { error: updErr } = await admin.from("photos").update({ thumbnail_path: thumbPath }).eq("id", v.id);
    if (updErr) { console.log(`${tag} db update FAILED: ${updErr.message}`); fail++; continue; }

    console.log(`${tag} OK -> ${thumbPath} (${(jpg.length / 1024).toFixed(0)}KB)`);
    ok++;
  } catch (e) {
    console.log(`${tag} ERROR: ${String(e.message).slice(0, 100)}`);
    fail++;
  } finally {
    for (const f of [tmpVid, tmpJpg]) { try { unlinkSync(f); } catch {} }
  }
}

console.log(`\nDone. ${ok} posters created, ${fail} failed.`);
