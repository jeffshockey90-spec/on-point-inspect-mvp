// The standard owner → inspector email (templates: We miss you, Need a hand,
// Custom, and any plain-text message). Renders the editable text body into clean
// HTML — styled paragraphs and bullet lists — with the FLOW header, CTA buttons,
// and footer. Email-client-safe: table layout, inline styles.

const APP_URL = "https://app.flowinspect.app";
const IOS_APP_URL = "https://apps.apple.com/us/app/flow-inspection-software/id6777555077";

function esc(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Blank-line-separated blocks become paragraphs (single newlines within a block
// stay tight as <br/>, so a signature doesn't spread out); "•" blocks render as
// a styled bullet list with a teal marker and a bold lead-in before " — ".
function renderMessageHtml(message: string): string {
  const blocks = String(message || "").split(/\n\s*\n/);
  const out: string[] = [];

  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;

    if (lines[0].startsWith("•")) {
      const rows = lines
        .map((line) => {
          const text = line.replace(/^•\s*/, "");
          const dash = text.indexOf(" — ");
          const html =
            dash > -1
              ? `<strong style="color:#0f172a;">${esc(text.slice(0, dash))}</strong>${esc(text.slice(dash))}`
              : esc(text);
          return `<tr><td valign="top" style="padding:3px 9px 3px 0;color:#14b8a6;font-weight:900;line-height:1.6;">•</td><td style="padding:3px 0;font-size:15px;line-height:1.6;color:#334155;">${html}</td></tr>`;
        })
        .join("");
      out.push(
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:2px 0 14px;">${rows}</table>`,
      );
    } else {
      const para = lines.map((l) => esc(l)).join("<br/>");
      out.push(
        `<p style="font-size:15px;line-height:1.7;color:#334155;margin:0 0 14px;">${para}</p>`,
      );
    }
  }

  return out.join("");
}

export function buildOwnerPlainEmail(message: string): string {
  const body = renderMessageHtml(message);
  return `<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.7;color:#0f172a;max-width:600px;margin:auto;padding:28px 24px;background:#ffffff;">
    <a href="${APP_URL}" style="text-decoration:none;">
      <img src="${APP_URL}/icons/icon-192-v2.png" alt="FLOW" width="52" height="52" style="border-radius:13px;vertical-align:middle;border:0;" />
      <span style="font-weight:900;font-size:24px;color:#14b8a6;vertical-align:middle;margin-left:12px;letter-spacing:0.01em;">FLOW</span>
    </a>
    <div style="height:1px;background:#e2e8f0;margin:20px 0 22px;"></div>
    <div style="font-size:15px;color:#0f172a;">${body}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:26px;">
      <tr>
        <td valign="middle" style="padding-right:14px;">
          <a href="${APP_URL}" style="display:inline-block;background:#14b8a6;color:#ffffff;font-weight:800;text-decoration:none;padding:13px 24px;border-radius:10px;">Open FLOW</a>
        </td>
        <td valign="middle">
          <a href="${IOS_APP_URL}" style="text-decoration:none;"><img src="${APP_URL}/email/app-store-badge.png" alt="Download on the App Store" height="46" style="display:block;border:0;height:46px;width:auto;" /></a>
        </td>
      </tr>
    </table>
    <p style="margin-top:28px;font-size:12px;color:#94a3b8;">You're receiving this because you have a FLOW inspector account.</p>
  </div>`;
}
