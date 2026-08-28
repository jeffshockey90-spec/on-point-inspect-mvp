// Designed HTML "What's New" email, sent to inspectors from the Owner Mail
// Center (template id "whats-new"). Renders the latest changelog entries as
// styled cards. Email-client-safe: table layout, inline styles, no external CSS.

const APP_URL = "https://app.flowinspect.app";
const IOS_APP_URL = "https://apps.apple.com/us/app/flow-inspection-software/id6777555077";
const IMG = `${APP_URL}/email`;

function esc(s: string) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Turn a changelog entry body (plain text with "•" bullets and paragraphs) into
// styled HTML: a lead paragraph, then bullets as a clean two-column list with a
// teal marker and a bold lead-in before the " — ".
function renderEntryBody(body: string): string {
  const lines = String(body || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const out: string[] = [];
  let bullets: string[] = [];

  const flush = () => {
    if (!bullets.length) return;
    out.push(
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:2px 0 0;">${bullets.join(
        "",
      )}</table>`,
    );
    bullets = [];
  };

  for (const line of lines) {
    if (line.startsWith("•")) {
      const text = line.replace(/^•\s*/, "");
      const dash = text.indexOf(" — ");
      const html =
        dash > -1
          ? `<strong style="color:#0f172a;">${esc(text.slice(0, dash))}</strong>${esc(text.slice(dash))}`
          : esc(text);
      bullets.push(
        `<tr><td valign="top" style="padding:4px 9px 4px 0;color:#14b8a6;font-weight:900;line-height:1.55;">•</td><td style="padding:4px 0;font-size:14px;line-height:1.55;color:#334155;">${html}</td></tr>`,
      );
    } else {
      flush();
      out.push(
        `<p style="font-size:14px;line-height:1.6;color:#334155;margin:0 0 8px;">${esc(line)}</p>`,
      );
    }
  }
  flush();
  return out.join("");
}

function card(title: string, body: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 16px;">
    <tr><td style="border:1px solid #e2e8f0;border-left:4px solid #14b8a6;border-radius:12px;padding:16px 18px;background:#ffffff;">
      <div style="font-size:17px;font-weight:900;color:#0f172a;margin:0 0 8px;">${esc(title)}</div>
      ${renderEntryBody(body)}
    </td></tr>
  </table>`;
}

export function buildWhatsNewEmail(
  firstName: string,
  entries: { title: string; body: string }[],
): string {
  const name = esc(firstName || "there");
  const cards = (entries || [])
    .slice(0, 6)
    .map((e) => card(e.title, e.body))
    .join("");

  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;max-width:600px;margin:auto;padding:28px 24px;background:#ffffff;">

  <a href="${APP_URL}" style="text-decoration:none;">
    <img src="${APP_URL}/icons/icon-192-v2.png" alt="FLOW" width="46" height="46" style="border-radius:12px;vertical-align:middle;border:0;" />
    <span style="font-weight:900;font-size:22px;color:#14b8a6;vertical-align:middle;margin-left:11px;">FLOW</span>
  </a>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px;">
    <tr><td style="background:#0f172a;border-radius:14px;padding:22px 22px;">
      <div style="font-size:12px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:#5eead4;">🚀 What's New</div>
      <div style="font-size:25px;font-weight:900;color:#ffffff;margin-top:6px;">New in FLOW</div>
    </td></tr>
  </table>

  <div style="margin-top:20px;">
    <p style="font-size:15px;line-height:1.7;color:#334155;margin:0 0 12px;">Hi ${name},</p>
    <p style="font-size:15px;line-height:1.7;color:#334155;margin:0 0 18px;">We've been shipping a lot lately — here's the latest, all built to make your inspections faster and easier.</p>
  </div>

  ${cards}

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 6px;">
    <tr>
      <td valign="middle" style="padding-right:14px;">
        <a href="${APP_URL}" style="display:inline-block;background:#14b8a6;color:#ffffff;font-weight:800;text-decoration:none;padding:14px 28px;border-radius:10px;">Open FLOW</a>
      </td>
      <td valign="middle">
        <a href="${IOS_APP_URL}" style="text-decoration:none;"><img src="${IMG}/app-store-badge.png" alt="Download on the App Store" height="48" style="display:block;border:0;height:48px;width:auto;" /></a>
      </td>
    </tr>
  </table>

  <p style="font-size:15px;line-height:1.7;color:#334155;margin:14px 0 14px;">If there's something you'd love to see next, just hit reply and let me know — that's actually me on the other end.</p>
  <div style="font-size:15px;line-height:1.5;color:#334155;margin:0 0 14px;">
    <div style="font-weight:800;color:#0f172a;">Jeff Shockey</div>
    <div>Founder, FLOW</div>
    <div><a href="https://flowinspect.app" style="color:#14b8a6;text-decoration:none;font-weight:700;">flowinspect.app</a></div>
  </div>

  <p style="margin-top:24px;font-size:12px;color:#94a3b8;">You're receiving this because you have a FLOW inspector account.</p>
</div>`;
}
