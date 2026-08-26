// Builds the AI-Camera hero from Jeff's REAL live-camera screenshots:
//   IMG_7615 = capture (defect + inspector note)  ->  IMG_7617 = AI-written finding
// Output: public/email/ai-camera.jpg
import sharp from "sharp";

const SRC_CAPTURE = "C:/Users/jeffs/Downloads/IMG_7615.PNG";
const SRC_FINDING = "C:/Users/jeffs/Downloads/IMG_7617.PNG";
const OUT = "public/email/ai-camera.jpg";

const TEAL = "#14b8a6";
const PANEL = "#0b1220";
const LINE = "#1e293b";
const MUTE = "#94a3b8";
const FONT = "Arial, Helvetica, sans-serif";

const PHONE_W = 468;
const RADIUS = 40;

async function roundedPhone(src) {
  const base = await sharp(src).resize({ width: PHONE_W }).png().toBuffer();
  const { width: w, height: h } = await sharp(base).metadata();
  const mask = Buffer.from(
    `<svg width="${w}" height="${h}"><rect x="0" y="0" width="${w}" height="${h}" rx="${RADIUS}" ry="${RADIUS}"/></svg>`,
  );
  const border = Buffer.from(
    `<svg width="${w}" height="${h}"><rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="${RADIUS}" ry="${RADIUS}" fill="none" stroke="#334155" stroke-width="3"/></svg>`,
  );
  const buf = await sharp(base)
    .composite([{ input: mask, blend: "dest-in" }, { input: border, blend: "over" }])
    .png()
    .toBuffer();
  return { buf, w, h };
}

const p1 = await roundedPhone(SRC_CAPTURE);
const p2 = await roundedPhone(SRC_FINDING);
const PH = Math.max(p1.h, p2.h);

const padX = 70;
const gap = 120;
const topBand = 150;
const bottomBand = 96;
const W = padX + PHONE_W + gap + PHONE_W + padX;
const H = topBand + PH + bottomBand;

const leftX = padX;
const rightX = padX + PHONE_W + gap;
const phoneY = topBand;
const midY = phoneY + PH / 2;

function pill(cx, y, text) {
  const w = text.length * 11 + 44;
  return (
    `<rect x="${cx - w / 2}" y="${y - 26}" width="${w}" height="38" rx="19" fill="rgba(20,184,166,0.14)"/>` +
    `<text x="${cx}" y="${y}" font-family="${FONT}" font-size="17" font-weight="800" fill="${TEAL}" text-anchor="middle" letter-spacing="0.5">${text}</text>`
  );
}

let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
svg += `<rect x="0" y="0" width="${W}" height="${H}" rx="28" fill="${PANEL}" stroke="${LINE}" stroke-width="2"/>`;
svg += pill(leftX + PHONE_W / 2, 92, "1 — SNAP THE DEFECT + NOTE");
svg += pill(rightX + PHONE_W / 2, 92, "2 — AI WRITES THE FINDING");
// arrow across the gap
const ax0 = leftX + PHONE_W + 26, ax1 = rightX - 26;
svg += `<path d="M${ax0} ${midY} H${ax1 - 16}" stroke="${TEAL}" stroke-width="9" stroke-linecap="round"/>`;
svg += `<path d="M${ax1 - 24} ${midY - 15} L${ax1} ${midY} L${ax1 - 24} ${midY + 15} Z" fill="${TEAL}"/>`;
svg += `<text x="${W / 2}" y="${H - 38}" font-family="${FONT}" font-size="19" font-weight="700" fill="${MUTE}" text-anchor="middle">Point the phone at a defect — FLOW's AI writes the whole finding for you to approve.</text>`;
svg += `</svg>`;

await sharp(Buffer.from(svg))
  .composite([
    { input: p1.buf, left: leftX, top: phoneY },
    { input: p2.buf, left: rightX, top: phoneY },
  ])
  .jpeg({ quality: 86 })
  .toFile(OUT);

const meta = await sharp(OUT).metadata();
console.log("wrote", OUT, `${meta.width}x${meta.height}`);
