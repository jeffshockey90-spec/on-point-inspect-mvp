const sharp = require("sharp");
const path = require("path");

const SRC = path.join(
  __dirname,
  "..",
  "ios",
  "App",
  "App",
  "Assets.xcassets",
  "Splash.imageset",
  "on-point-splash.png"
);
const RES = path.join(__dirname, "..", "android", "app", "src", "main", "res");
const BG = { r: 2, g: 6, b: 23, alpha: 1 };

const TARGETS = {
  drawable: [480, 320],
  "drawable-land-hdpi": [800, 480],
  "drawable-land-mdpi": [480, 320],
  "drawable-land-xhdpi": [1280, 720],
  "drawable-land-xxhdpi": [1600, 960],
  "drawable-land-xxxhdpi": [1920, 1280],
  "drawable-port-hdpi": [480, 800],
  "drawable-port-mdpi": [320, 480],
  "drawable-port-xhdpi": [720, 1280],
  "drawable-port-xxhdpi": [960, 1600],
  "drawable-port-xxxhdpi": [1280, 1920],
};

async function main() {
  for (const [dir, [w, h]] of Object.entries(TARGETS)) {
    await sharp(SRC)
      .resize(w, h, { fit: "cover", background: BG })
      .flatten({ background: BG })
      .png()
      .toFile(path.join(RES, dir, "splash.png"));
    console.log(`wrote ${dir} (${w}x${h})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
