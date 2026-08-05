import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import ffmpegStaticPath from "ffmpeg-static";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FFMPEG_PATH =
  process.env.FFMPEG_PATH ||
  ffmpegStaticPath ||
  "C:\\Users\\jeffs\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.2-full_build\\bin\\ffmpeg.exe";

const MAX_INPUT_BYTES = 250 * 1024 * 1024;

function safeExtension(name: string) {
  const ext = path.extname(name || "").toLowerCase().replace(/[^a-z0-9.]/g, "");
  return ext || ".mov";
}

function runProcess(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    if (!command) {
      reject(new Error("FFmpeg binary was not found."));
      return;
    }

    const child = spawn(command, args, {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });

    let stderr = "";
    let settled = false;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve();
    };

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 30000) stderr = stderr.slice(-30000);
    });

    child.on("error", (error) => {
      finish(
        new Error(
          `FFmpeg could not start. ${error?.message || "Unknown process error."}`,
        ),
      );
    });

    child.on("close", (code) => {
      if (code === 0) {
        finish();
        return;
      }

      finish(
        new Error(
          stderr.trim() ||
            `FFmpeg exited with code ${String(code ?? "unknown")}.`,
        ),
      );
    });
  });
}

async function convertVideo(inputPath: string, outputPath: string) {
  await runProcess(FFMPEG_PATH, [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",

    "-i",
    inputPath,

    // Keep only the first real video stream and optional first audio stream.
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",

    // Strip rotation/location/Apple metadata that can confuse browsers.
    "-map_metadata",
    "-1",
    "-map_chapters",
    "-1",

    // Produce browser-safe H.264 while preserving inspection detail.
    // Scale down only when a video is larger than 1080p.
    "-vf",
    "scale='min(1920,iw)':-2:force_original_aspect_ratio=decrease,setsar=1,format=yuv420p",

    "-r",
    "30",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "21",
    "-pix_fmt",
    "yuv420p",
    "-profile:v",
    "main",
    "-level:v",
    "4.0",

    // Rebuild audio for Safari/Chrome compatibility.
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ac",
    "2",
    "-ar",
    "48000",

    // Put MP4 metadata at the beginning for fast mobile playback.
    "-movflags",
    "+faststart",
    "-f",
    "mp4",

    outputPath,
  ]);
}

export async function POST(request: NextRequest) {
  let tempDir = "";

  try {
    const formData = await request.formData();
    const video = formData.get("video");

    if (!(video instanceof File)) {
      return NextResponse.json(
        { error: "Missing video file." },
        { status: 400 },
      );
    }

    if (!video.size) {
      return NextResponse.json(
        { error: "The selected video is empty." },
        { status: 400 },
      );
    }

    if (video.size > MAX_INPUT_BYTES) {
      return NextResponse.json(
        { error: "Video is too large to convert. Keep videos under 250 MB." },
        { status: 413 },
      );
    }

    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "opi-video-"));

    const inputPath = path.join(tempDir, `input${safeExtension(video.name)}`);
    const outputPath = path.join(tempDir, "converted.mp4");

    await fs.writeFile(inputPath, Buffer.from(await video.arrayBuffer()));

    // The traced ffmpeg binary can lose its executable bit in the serverless
    // bundle; restore it so spawn() doesn't fail with EACCES (no-op locally).
    if (FFMPEG_PATH) {
      await fs.chmod(FFMPEG_PATH, 0o755).catch(() => undefined);
    }

    await convertVideo(inputPath, outputPath);

    const stats = await fs.stat(outputPath);
    if (!stats.isFile() || stats.size <= 0) {
      throw new Error("Video conversion returned an empty MP4.");
    }

    const convertedBuffer = await fs.readFile(outputPath);

    return new NextResponse(convertedBuffer, {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(convertedBuffer.length),
        "Content-Disposition": 'inline; filename="converted.mp4"',
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error: any) {
    console.error("VIDEO CONVERT ERROR:", {
      message: error?.message || "Unknown error",
    });

    return NextResponse.json(
      {
        error: error?.message || "Video conversion failed.",
      },
      { status: 500 },
    );
  } finally {
    if (tempDir) {
      await fs
        .rm(tempDir, { recursive: true, force: true })
        .catch(() => undefined);
    }
  }
}
