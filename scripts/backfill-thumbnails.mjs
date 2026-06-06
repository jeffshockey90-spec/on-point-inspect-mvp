/* eslint-disable no-console */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import path from "node:path";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PHOTO_BUCKET = "inspection-photos";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TABLES = [
  { name: "photos", idColumn: "id", filePathColumns: ["file_path"], urlColumns: ["public_url"] },
  { name: "section_reference_photos", idColumn: "id", filePathColumns: ["file_path"], urlColumns: ["public_url"] },
  { name: "limitation_photos", idColumn: "id", filePathColumns: ["file_path"], urlColumns: ["public_url"] },
  { name: "equipment_inventory", idColumn: "id", filePathColumns: ["file_path"], urlColumns: ["public_url", "image_url", "signed_image_url"] },
];

function getStoragePathFromUrl(url) {
  if (!url || typeof url !== "string") return "";
  let clean = url.trim();
  try { clean = decodeURIComponent(clean); } catch {}
  clean = clean.split("?")[0];

  const markers = [
    "/storage/v1/object/public/inspection-photos/",
    "/storage/v1/object/sign/inspection-photos/",
    "/object/public/inspection-photos/",
    "/object/sign/inspection-photos/",
    "/inspection-photos/",
  ];

  for (const marker of markers) {
    const index = clean.indexOf(marker);
    if (index !== -1) return clean.substring(index + marker.length);
  }

  return "";
}

function getOriginalPath(row, config) {
  for (const column of config.filePathColumns) {
    if (row[column]) return String(row[column]);
  }

  for (const column of config.urlColumns) {
    const storagePath = getStoragePathFromUrl(row[column]);
    if (storagePath) return storagePath;
  }

  return "";
}

function isImagePath(filePath) {
  const ext = path.extname(String(filePath).toLowerCase());
  if (!ext) return true;
  return [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"].includes(ext);
}

function makeThumbnailPath(originalPath, rowId) {
  const parsed = path.posix.parse(originalPath);
  const safeName = parsed.name.replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 80);
  const dir = parsed.dir ? `${parsed.dir}/thumbnails` : "thumbnails";
  return `${dir}/${safeName}-${rowId}-thumb.jpg`;
}

async function createThumbnailBuffer(originalBuffer) {
  return sharp(originalBuffer)
    .rotate()
    .resize({
      width: 480,
      height: 480,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({
      quality: 72,
      mozjpeg: true,
    })
    .toBuffer();
}

async function fetchRows(tableName, limit) {
  const { data, error } = await supabase
    .from(tableName)
    .select("*")
    .is("thumbnail_path", null)
    .limit(limit);

  if (error) {
    console.error(`[${tableName}] select error:`, error.message);
    return [];
  }

  return data || [];
}

async function backfillTable(config) {
  const pageSize = 100;
  let processed = 0;
  let created = 0;
  let skipped = 0;
  let failed = 0;
  let loopCount = 0;

  console.log(`\n=== Backfilling ${config.name} ===`);

  while (true) {
    loopCount += 1;

    const rows = await fetchRows(config.name, pageSize);
    if (!rows.length) break;

    for (const row of rows) {
      processed += 1;

      const originalPath = getOriginalPath(row, config);

      if (!originalPath) {
        skipped += 1;
        console.log(`[${config.name}] skipped ${row.id}: no file path`);
        continue;
      }

      if (!isImagePath(originalPath)) {
        skipped += 1;
        console.log(`[${config.name}] skipped ${row.id}: not image ${originalPath}`);

        await supabase
          .from(config.name)
          .update({
            thumbnail_path: "SKIPPED_NON_IMAGE",
            thumbnail_url: null,
          })
          .eq(config.idColumn, row[config.idColumn]);

        continue;
      }

      try {
        const { data: originalData, error: downloadError } =
          await supabase.storage.from(PHOTO_BUCKET).download(originalPath);

        if (downloadError || !originalData) {
          failed += 1;
          console.error(
            `[${config.name}] download failed ${row.id}:`,
            downloadError?.message || "No file returned"
          );
          continue;
        }

        const originalBuffer = Buffer.from(await originalData.arrayBuffer());
        const thumbnailBuffer = await createThumbnailBuffer(originalBuffer);
        const thumbnailPath = makeThumbnailPath(originalPath, row[config.idColumn]);

        const { error: uploadError } = await supabase.storage
          .from(PHOTO_BUCKET)
          .upload(thumbnailPath, thumbnailBuffer, {
            contentType: "image/jpeg",
            cacheControl: "31536000",
            upsert: true,
          });

        if (uploadError) {
          failed += 1;
          console.error(`[${config.name}] upload failed ${row.id}:`, uploadError.message);
          continue;
        }

        const { data: publicData } = supabase.storage
          .from(PHOTO_BUCKET)
          .getPublicUrl(thumbnailPath);

        const { error: updateError } = await supabase
          .from(config.name)
          .update({
            thumbnail_path: thumbnailPath,
            thumbnail_url: publicData.publicUrl,
          })
          .eq(config.idColumn, row[config.idColumn]);

        if (updateError) {
          failed += 1;
          console.error(`[${config.name}] update failed ${row.id}:`, updateError.message);
          continue;
        }

        created += 1;

        if (created % 25 === 0) {
          console.log(`[${config.name}] created ${created} thumbnails...`);
        }
      } catch (error) {
        failed += 1;
        console.error(`[${config.name}] failed ${row.id}:`, error?.message || error);
      }
    }

    if (loopCount > 50) {
      console.log(
        `[${config.name}] stopped after 50 passes. Remaining rows are probably failed downloads or invalid files.`
      );
      break;
    }
  }

  console.log(
    `[${config.name}] done. processed=${processed}, created=${created}, skipped=${skipped}, failed=${failed}`
  );
}

async function main() {
  console.log("Starting On Point Inspect thumbnail backfill...");
  console.log("Bucket:", PHOTO_BUCKET);

  for (const config of TABLES) {
    await backfillTable(config);
  }

  console.log("\nThumbnail backfill complete.");
}

main().catch((error) => {
  console.error("Fatal thumbnail backfill error:", error);
  process.exit(1);
});