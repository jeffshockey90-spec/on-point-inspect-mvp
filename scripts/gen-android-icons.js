const sharp = require("sharp");
const path = require("path");

const SRC = path.join(__dirname, "..", "public", "on-point-app-icon-1024.png");
const RES = path.join(__dirname, "..", "android", "app", "src", "main", "res");

const DENSITIES = {
  mdpi: { legacy: 48, fg: 108 },
  hdpi: { legacy: 72, fg: 162 },
  xhdpi: { legacy: 96, fg: 216 },
  xxhdpi: { legacy: 144, fg: 324 },
  xxxhdpi: { legacy: 192, fg: 432 },
};

async function buildForegroundMaster() {
  // Chroma-key the flat black background out to transparent, isolating the
  // FLOW mark, then re-center it scaled into Android's adaptive-icon safe
  // zone (~66% of the canvas) so launcher masks (circle/squircle/rounded
  // square) don't clip it.
  const master = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { data, info } = master;
  const { width, height, channels } = info;

  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r < 18 && g < 18 && b < 18) {
      data[i + 3] = 0;
    }
  }

  const cutout = sharp(data, { raw: { width, height, channels } }).png();
  const trimmed = await cutout.trim().toBuffer();
  const trimmedMeta = await sharp(trimmed).metadata();

  const canvas = 1024;
  const safeZone = Math.round(canvas * 0.62);
  const scale = safeZone / Math.max(trimmedMeta.width, trimmedMeta.height);
  const targetW = Math.round(trimmedMeta.width * scale);
  const targetH = Math.round(trimmedMeta.height * scale);

  return sharp({
    create: {
      width: canvas,
      height: canvas,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: await sharp(trimmed).resize(targetW, targetH).toBuffer(),
        gravity: "center",
      },
    ])
    .png()
    .toBuffer();
}

async function main() {
  const foregroundMaster = await buildForegroundMaster();

  for (const [density, sizes] of Object.entries(DENSITIES)) {
    const dir = path.join(RES, `mipmap-${density}`);

    await sharp(SRC).resize(sizes.legacy, sizes.legacy).png().toFile(path.join(dir, "ic_launcher.png"));
    await sharp(SRC).resize(sizes.legacy, sizes.legacy).png().toFile(path.join(dir, "ic_launcher_round.png"));
    await sharp(foregroundMaster)
      .resize(sizes.fg, sizes.fg)
      .png()
      .toFile(path.join(dir, "ic_launcher_foreground.png"));

    console.log(`wrote ${density}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
