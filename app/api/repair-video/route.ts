import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { spawn } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import ffmpegStaticPath from "ffmpeg-static";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PHOTO_BUCKET = "inspection-photos";
const MAX_INPUT_BYTES = 250 * 1024 * 1024;

const FFMPEG_PATH =
  process.env.FFMPEG_PATH ||
  ffmpegStaticPath ||
  "C:\\Users\\jeffs\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.2-full_build\\bin\\ffmpeg.exe";

async function createUserClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    },
  );
}

function safeExtension(value: string) {
  const extension = path
    .extname(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, "");

  return extension || ".mov";
}

function normalizeStoragePath(value: unknown) {
  let clean = String(value || "").trim();
  if (!clean) return "";

  try {
    clean = decodeURIComponent(clean);
  } catch {}

  clean = clean.split("?")[0];

  const markers = [
    "/object/public/inspection-photos/",
    "/object/sign/inspection-photos/",
    "/inspection-photos/",
  ];

  for (const marker of markers) {
    const index = clean.indexOf(marker);
    if (index !== -1) return clean.slice(index + marker.length);
  }

  return clean.replace(/^\/+/, "");
}

function getOriginalStoragePath(photo: any) {
  const candidates = [
    photo?.file_path,
    photo?.storage_path,
    photo?.photo_path,
    photo?.image_path,
    photo?.video_path,
    photo?.public_url,
    photo?.video_url,
    photo?.url,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeStoragePath(candidate);
    if (normalized) return normalized;
  }

  return "";
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
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    "-map_metadata",
    "-1",
    "-map_chapters",
    "-1",
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
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ac",
    "2",
    "-ar",
    "48000",
    "-movflags",
    "+faststart",
    "-f",
    "mp4",
    outputPath,
  ]);
}

export async function POST(request: Request) {
  let tempDir = "";

  try {
    const supabase = await createUserClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "You must be signed in to repair this video." },
        { status: 401 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const photoId = String(body?.photoId || "").trim();

    if (!photoId) {
      return NextResponse.json(
        { error: "Missing video record ID." },
        { status: 400 },
      );
    }

    // This uses the signed-in user's RLS permissions, so an inspector can only
    // repair a photo record they are already allowed to read and update.
    const { data: photo, error: photoError } = await supabase
      .from("photos")
      .select("*")
      .eq("id", photoId)
      .maybeSingle();

    if (photoError) throw photoError;

    if (!photo) {
      return NextResponse.json(
        { error: "Video record was not found or is not accessible." },
        { status: 404 },
      );
    }

    const originalPath = getOriginalStoragePath(photo);

    if (!originalPath) {
      return NextResponse.json(
        { error: "The original storage path could not be determined." },
        { status: 400 },
      );
    }

    const { data: originalFile, error: downloadError } = await supabase.storage
      .from(PHOTO_BUCKET)
      .download(originalPath);

    if (downloadError || !originalFile) {
      throw new Error(
        downloadError?.message || "The original video could not be downloaded.",
      );
    }

    if (!originalFile.size) {
      throw new Error("The original video file is empty.");
    }

    if (originalFile.size > MAX_INPUT_BYTES) {
      return NextResponse.json(
        { error: "Video is too large to repair automatically. Keep videos under 250 MB." },
        { status: 413 },
      );
    }

    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "opi-repair-video-"));

    const inputPath = path.join(
      tempDir,
      `original${safeExtension(originalPath)}`,
    );
    const outputPath = path.join(tempDir, "repaired.mp4");

    await fs.writeFile(inputPath, Buffer.from(await originalFile.arrayBuffer()));
    await convertVideo(inputPath, outputPath);

    const stats = await fs.stat(outputPath);
    if (!stats.isFile() || stats.size <= 0) {
      throw new Error("Video repair returned an empty MP4.");
    }

    const repairedBuffer = await fs.readFile(outputPath);
    const parsedPath = path.posix.parse(originalPath.replace(/\\/g, "/"));
    const repairedPath = path.posix.join(
      parsedPath.dir,
      `${parsedPath.name}-browser-${Date.now()}.mp4`,
    );

    const { error: uploadError } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(repairedPath, repairedBuffer, {
        contentType: "video/mp4",
        cacheControl: "31536000",
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data: publicData } = supabase.storage
      .from(PHOTO_BUCKET)
      .getPublicUrl(repairedPath);

    const { error: updateError } = await supabase
      .from("photos")
      .update({
        file_path: repairedPath,
        public_url: publicData.publicUrl,
        is_video: true,
        mime_type: "video/mp4",
      })
      .eq("id", photoId);

    if (updateError) {
      await supabase.storage
        .from(PHOTO_BUCKET)
        .remove([repairedPath])
        .catch(() => undefined);
      throw updateError;
    }

    const { data: signedData, error: signedError } = await supabase.storage
      .from(PHOTO_BUCKET)
      .createSignedUrl(repairedPath, 60 * 60 * 24 * 7);

    if (signedError || !signedData?.signedUrl) {
      throw new Error(
        signedError?.message || "The repaired video URL could not be created.",
      );
    }

    return NextResponse.json({
      ok: true,
      photoId,
      originalPath,
      repairedPath,
      signedUrl: signedData.signedUrl,
      publicUrl: publicData.publicUrl,
      mimeType: "video/mp4",
    });
  } catch (error: any) {
    console.error("VIDEO AUTO-REPAIR ERROR:", {
      message: error?.message || "Unknown error",
    });

    return NextResponse.json(
      { error: error?.message || "Automatic video repair failed." },
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
