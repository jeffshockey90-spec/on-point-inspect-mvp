import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LOCAL_FFMPEG_PATH =
  "C:\\Users\\jeffs\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.2-full_build\\bin\\ffmpeg.exe";

function safeExtension(name: string) {
  const ext = path.extname(name || "").toLowerCase().replace(/[^a-z0-9.]/g, "");
  return ext || ".mov";
}

function runProcess(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "ignore", "pipe"],
    });

    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 30000) {
        stderr = stderr.slice(-30000);
      }
    });

    child.on("error", reject);

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr || `FFmpeg failed ${code}`));
      }
    });
  });
}

async function convertVideo(inputPath: string, outputPath: string) {
  await runProcess(LOCAL_FFMPEG_PATH, [
    "-y",

    "-i",
    inputPath,

    // iPhone files can contain audio first, video second, and Apple metadata streams.
    // Rebuild only the real video/audio streams and strip all metadata.
    "-map",
    "0:v:0",

    "-map",
    "0:a?",

    "-map_metadata",
    "-1",

    // Completely rebuild browser-safe frames.
    "-vf",
    "scale=720:-2,setsar=1,format=yuv420p",

    "-r",
    "30",

    "-c:v",
    "libx264",

    "-preset",
    "veryfast",

    "-crf",
    "23",

    "-pix_fmt",
    "yuv420p",

    "-profile:v",
    "baseline",

    "-level:v",
    "3.1",

    // Rebuild audio for browser compatibility.
    "-c:a",
    "aac",

    "-b:a",
    "128k",

    "-ac",
    "2",

    "-ar",
    "44100",

    "-movflags",
    "+faststart",

    "-f",
    "mp4",

    outputPath,
  ]);
}

export async function POST(request: NextRequest) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "opi-video-"));

  try {
    const formData = await request.formData();
    const video = formData.get("video");

    if (!(video instanceof File)) {
      return NextResponse.json(
        { error: "Missing video file" },
        { status: 400 }
      );
    }

    const inputPath = path.join(tempDir, `input${safeExtension(video.name)}`);
    const outputPath = path.join(tempDir, "converted.mp4");

    await fs.writeFile(inputPath, Buffer.from(await video.arrayBuffer()));
    await convertVideo(inputPath, outputPath);

    const convertedBuffer = await fs.readFile(outputPath);

    if (!convertedBuffer.length) {
      throw new Error("Converted file empty");
    }

    return new NextResponse(convertedBuffer, {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(convertedBuffer.length),
        "Content-Disposition": 'inline; filename="converted.mp4"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error: any) {
    console.error("VIDEO CONVERT ERROR:", error);

    return NextResponse.json(
      {
        error: error?.message || "Video conversion failed",
      },
      { status: 500 }
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
