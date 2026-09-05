import { spawn } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import ffmpegStaticPath from "ffmpeg-static";

// Extract a poster/still frame from a video so it can be shown where a video
// can't play (the report PDF, print, etc.). ffmpeg-static ships the binary and
// is traced into the serverless bundle per-route (next.config.js
// outputFileTracingIncludes) — the same setup /api/repair-video uses.

const LOCAL_FFMPEG_PATH =
  "C:\\Users\\jeffs\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.2-full_build\\bin\\ffmpeg.exe";

export async function resolveFfmpegPath(): Promise<string> {
  const candidates = [
    process.env.FFMPEG_PATH,
    ffmpegStaticPath as unknown as string,
    path.join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg"),
    // Traced copy that lands next to the compiled route in the serverless bundle.
    path.join(process.cwd(), ".next", "server", "app", "api", "cron", "backfill-video-posters", "ffmpeg"),
    process.platform === "win32" ? LOCAL_FFMPEG_PATH : "",
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      if (process.platform !== "win32") {
        await fs.chmod(candidate, 0o755).catch(() => undefined);
      }
      return candidate;
    } catch {}
  }
  throw new Error(`FFmpeg binary was not found. Checked: ${candidates.join(", ")}`);
}

function run(bin: string, args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: "ignore" });
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("ffmpeg timed out"));
    }, timeoutMs);
    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`));
    });
  });
}

// Returns a JPEG poster (Buffer) for the given video bytes, or null if a frame
// can't be produced. Never throws — callers treat null as "no poster".
export async function extractVideoPosterJpeg(
  video: Buffer,
  opts: { width?: number; timeoutMs?: number } = {},
): Promise<Buffer | null> {
  const width = opts.width ?? 1200;
  const timeoutMs = opts.timeoutMs ?? 20000;
  const stamp = `${process.pid}-${video.length}`;
  const inPath = path.join(os.tmpdir(), `poster-in-${stamp}.mp4`);
  const outPath = path.join(os.tmpdir(), `poster-out-${stamp}.jpg`);
  try {
    const ffmpeg = await resolveFfmpegPath();
    await fs.writeFile(inPath, video);
    // Try 1s in, then the very first frame for short clips.
    for (const ss of ["00:00:01", "00:00:00"]) {
      try {
        await run(
          ffmpeg,
          ["-y", "-ss", ss, "-i", inPath, "-frames:v", "1", "-vf", `scale='min(${width},iw)':-2`, "-q:v", "4", outPath],
          timeoutMs,
        );
        const jpg = await fs.readFile(outPath);
        if (jpg.length > 0) return jpg;
      } catch {}
    }
    return null;
  } catch {
    return null;
  } finally {
    await fs.unlink(inPath).catch(() => undefined);
    await fs.unlink(outPath).catch(() => undefined);
  }
}
