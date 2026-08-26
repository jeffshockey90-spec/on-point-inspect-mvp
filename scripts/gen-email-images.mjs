// Generates the on-brand illustration PNGs used in the "AI Camera + Field
// Tools" inspector email. Run: node scripts/gen-email-images.mjs
// Output: public/email/*.png  (referenced at https://app.flowinspect.app/email/…)
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const OUT = "public/email";
await mkdir(OUT, { recursive: true });

const FONT = "Arial, Helvetica, sans-serif";
const INK = "#e2e8f0";
const MUTE = "#94a3b8";
const TEAL = "#14b8a6";
const CARD = "#0f172a";
const PANEL = "#0b1220";
const LINE = "#1e293b";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function rr(x, y, w, h, r, fill, stroke, sw = 0) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ry="${r}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="${sw}"` : ""}/>`;
}
function t(x, y, size, fill, weight, content, { anchor = "start", spacing = 0 } = {}) {
  return `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${spacing ? ` letter-spacing="${spacing}"` : ""}>${esc(content)}</text>`;
}
async function render(name, w, h, inner, extraDensity = 144) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${inner}</svg>`;
  await sharp(Buffer.from(svg), { density: extraDensity }).png().toFile(`${OUT}/${name}.png`);
  console.log("wrote", `${OUT}/${name}.png`, `${w}x${h}`);
}

/* ---------- Figure 1: AI Camera — what it does ---------- */
{
  const W = 1080, H = 600;
  let s = "";
  s += rr(0, 0, W, H, 28, PANEL, LINE, 2);

  // Phone
  const px = 70, py = 52, pw = 300, ph = 496;
  s += rr(px, py, pw, ph, 40, "#05070d", "#334155", 3);
  const sx = px + 16, sy = py + 16, sw = pw - 32, sh = ph - 32;
  s += rr(sx, sy, sw, sh, 26, "#0f172a");
  s += t(px + pw / 2, sy + 34, 15, TEAL, "800", "LIVE CAMERA", { anchor: "middle", spacing: 2 });
  // camera scene
  const cvx = sx + 14, cvy = sy + 52, cvw = sw - 28, cvh = sh - 150;
  s += `<defs><linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#475569"/><stop offset="1" stop-color="#334155"/></linearGradient></defs>`;
  s += rr(cvx, cvy, cvw, cvh, 14, "url(#wall)");
  // defect: water stain + pipe
  s += `<ellipse cx="${cvx + cvw * 0.52}" cy="${cvy + cvh * 0.5}" rx="70" ry="52" fill="#1f2937" opacity="0.85"/>`;
  s += `<ellipse cx="${cvx + cvw * 0.62}" cy="${cvy + cvh * 0.42}" rx="42" ry="30" fill="#111827" opacity="0.8"/>`;
  s += `<rect x="${cvx + cvw * 0.34}" y="${cvy + 8}" width="26" height="${cvh - 16}" fill="#6b7280" opacity="0.5"/>`;
  s += `<rect x="${cvx + cvw * 0.34}" y="${cvy + cvh * 0.45}" width="26" height="18" fill="#7f5539" opacity="0.9"/>`;
  // focus reticle
  const rxc = cvx + cvw * 0.55, ryc = cvy + cvh * 0.5, rs = 60;
  s += rr(rxc - rs, ryc - rs, rs * 2, rs * 2, 10, "none", TEAL, 3);
  // shutter
  s += `<circle cx="${px + pw / 2}" cy="${sy + sh - 44}" r="26" fill="none" stroke="#ffffff" stroke-width="4"/>`;
  s += `<circle cx="${px + pw / 2}" cy="${sy + sh - 44}" r="17" fill="#ffffff"/>`;

  // Arrow
  s += `<path d="M392 300 H470" stroke="${TEAL}" stroke-width="8" stroke-linecap="round"/>`;
  s += `<path d="M462 286 L484 300 L462 314 Z" fill="${TEAL}"/>`;

  // Finding card
  const fx = 502, fy = 74, fw = 508, fh = 452;
  s += rr(fx, fy, fw, fh, 24, CARD, "#134e4a", 2);
  s += rr(fx + 26, fy + 26, 96, 30, 15, "rgba(20,184,166,0.15)");
  s += t(fx + 74, fy + 46, 14, TEAL, "800", "AI DRAFT", { anchor: "middle", spacing: 1 });
  s += t(fx + fw - 26, fy + 46, 14, MUTE, "700", "auto-written", { anchor: "end" });
  s += t(fx + 26, fy + 98, 27, "#f8fafc", "800", "Corroded fitting at the");
  s += t(fx + 26, fy + 130, 27, "#f8fafc", "800", "water heater");
  s += rr(fx + 26, fy + 150, 168, 30, 15, "rgba(239,68,68,0.15)");
  s += t(fx + 40, fy + 170, 14, "#fca5a5", "800", "SAFETY — REPAIR", { spacing: 1 });

  const sections = [
    ["OBSERVATION", "Active corrosion on the hot-water outlet fitting."],
    ["IMPLICATION", "Risk of a leak and premature tank failure."],
    ["RECOMMENDATION", "Have a licensed plumber evaluate and repair."],
  ];
  let yy = fy + 214;
  for (const [label, line] of sections) {
    s += t(fx + 26, yy, 13, TEAL, "800", label, { spacing: 1 });
    s += t(fx + 26, yy + 24, 17, INK, "500", line);
    yy += 62;
  }
  // buttons
  s += rr(fx + 26, fy + fh - 62, 150, 40, 12, TEAL);
  s += t(fx + 101, fy + fh - 36, 16, "#04211d", "800", "Approve", { anchor: "middle" });
  s += rr(fx + 190, fy + fh - 62, 110, 40, 12, "none", "#475569", 2);
  s += t(fx + 245, fy + fh - 36, 16, INK, "700", "Edit", { anchor: "middle" });

  s += t(W / 2, H - 26, 18, MUTE, "600", "Point the phone at a defect — the AI writes the whole finding for you to approve.", { anchor: "middle" });
  await render("ai-camera", W, H, s);
}

/* ---------- Figure 2: How to open it (3 steps) ---------- */
{
  const W = 1080, H = 340;
  let s = rr(0, 0, W, H, 28, PANEL, LINE, 2);
  const steps = [
    ["1", "Open a report, tap", "Capture Tools → Field Tool"],
    ["2", "Tap the", "Live Camera tab"],
    ["3", "Tap Open AI Camera", "and shoot the defect"],
  ];
  const cw = 300, gap = 46, startX = (W - (cw * 3 + gap * 2)) / 2, cy = 70, ch = 200;
  steps.forEach(([n, l1, l2], i) => {
    const x = startX + i * (cw + gap);
    s += rr(x, cy, cw, ch, 20, CARD, LINE, 2);
    s += `<circle cx="${x + 44}" cy="${cy + 46}" r="26" fill="${TEAL}"/>`;
    s += t(x + 44, cy + 54, 26, "#04211d", "900", n, { anchor: "middle" });
    s += t(x + 26, cy + 118, 19, MUTE, "600", l1);
    s += t(x + 26, cy + 150, 21, "#f8fafc", "800", l2);
    if (i < 2) {
      const ax = x + cw + gap / 2;
      s += `<path d="M${ax - 12} ${cy + ch / 2} H${ax + 12}" stroke="${TEAL}" stroke-width="6" stroke-linecap="round"/>`;
      s += `<path d="M${ax + 6} ${cy + ch / 2 - 9} L${ax + 20} ${cy + ch / 2} L${ax + 6} ${cy + ch / 2 + 9} Z" fill="${TEAL}"/>`;
    }
  });
  s += t(W / 2, cy + ch + 66, 18, MUTE, "600", "It works on your phone, right in the field — online or off.", { anchor: "middle" });
  await render("how-to-open", W, H, s);
}

/* ---------- Figure 3: Command Center ---------- */
{
  const W = 1080, H = 600;
  let s = rr(0, 0, W, H, 28, PANEL, LINE, 2);
  // phone
  const px = 70, py = 52, pw = 300, ph = 496;
  s += rr(px, py, pw, ph, 40, "#05070d", "#334155", 3);
  const sx = px + 16, sy = py + 16, sw = pw - 32, sh = ph - 32;
  s += rr(sx, sy, sw, sh, 26, "#0f172a");
  s += t(sx + 18, sy + 40, 18, "#f8fafc", "800", "Command Center");
  s += t(sx + 18, sy + 64, 13, TEAL, "700", "Press Ctrl-K on any report", { spacing: 0.5 });
  // alert banner
  s += rr(sx + 14, sy + 84, sw - 28, 46, 12, "rgba(245,158,11,0.14)");
  s += `<circle cx="${sx + 34}" cy="${sy + 107}" r="6" fill="#f59e0b"/>`;
  s += t(sx + 50, sy + 112, 14, "#fcd34d", "700", "1 item needs attention");
  // tiles grid 2 cols
  const tiles = ["AI Review", "Publish Guard", "Signatures", "Payments", "Repairs", "Engagement"];
  const gx = sx + 14, gy = sy + 146, gw = (sw - 28 - 12) / 2, gh = 58, ggap = 12;
  tiles.forEach((label, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = gx + col * (gw + ggap), y = gy + row * (gh + ggap);
    s += rr(x, y, gw, gh, 12, "#0b1220", LINE, 1.5);
    s += `<circle cx="${x + 22}" cy="${y + gh / 2}" r="8" fill="none" stroke="${TEAL}" stroke-width="2.5"/>`;
    s += t(x + 40, y + gh / 2 + 5, 14, INK, "700", label);
  });

  // right copy
  const rx = 470;
  s += t(rx, 130, 34, "#f8fafc", "900", "One shortcut,");
  s += t(rx, 170, 34, "#f8fafc", "900", "the whole report.");
  s += t(rx, 214, 18, MUTE, "500", "Everything that happens after you capture —");
  s += t(rx, 240, 18, MUTE, "500", "in one place, with alerts that jump you");
  s += t(rx, 266, 18, MUTE, "500", "straight to the finding that needs you.");
  const bullets = ["AI safety review before you publish", "Publish blockers caught automatically", "Signatures, payments & agreements", "Repair-request negotiation", "Client engagement & report views"];
  let by = 316;
  for (const b of bullets) {
    s += `<path d="M${rx} ${by - 5} l7 7 l13 -15" stroke="${TEAL}" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    s += t(rx + 34, by, 18, INK, "600", b);
    by += 46;
  }
  await render("command-center", W, H, s);
}

console.log("done");
