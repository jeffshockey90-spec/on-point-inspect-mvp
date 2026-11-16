// Adds the company's logo and brand-color accent bar to the top of a
// client email. Applied at each client-email send so every template gets the
// inspector's own branding without rewriting each layout. Inputs come from the
// company's settings, so both are validated: only a 3/6-digit hex color is used
// in CSS and only an https logo URL is used as an image.

import type { CompanyBranding } from "./companyBranding";

const FALLBACK_COLOR = "#14b8a6";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function safeBrandColor(value: unknown): string {
  const color = String(value || "").trim();
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color) ? color : FALLBACK_COLOR;
}

export function safeLogoUrl(value: unknown): string | null {
  const url = String(value || "").trim();
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

const MARKER = "data-flow-brand-header";

export function emailBrandHeader(branding: Pick<CompanyBranding, "name" | "logoUrl" | "brandColor">): string {
  const color = safeBrandColor(branding.brandColor);
  const logo = safeLogoUrl(branding.logoUrl);
  const name = escapeHtml(branding.name);
  // No logo: just the brand-color bar (the templates already show the name).
  if (!logo) {
    return `<div ${MARKER}="1" style="max-width:680px;margin:0 auto;border-top:4px solid ${color};"></div>`;
  }
  return `<div ${MARKER}="1" style="max-width:680px;margin:0 auto;background:#ffffff;border-top:4px solid ${color};padding:16px 20px;text-align:center;"><img src="${escapeHtml(logo)}" alt="${name}" style="display:block;margin:0 auto;max-height:64px;max-width:220px;height:auto;border:0;" /></div>`;
}

/** Prepend the branded header to an email's HTML (once). */
export function brandEmailHtml(
  html: string | null | undefined,
  branding: Pick<CompanyBranding, "name" | "logoUrl" | "brandColor"> | null | undefined,
): string {
  const body = String(html || "");
  if (!branding || !body || body.includes(MARKER)) return body;
  const header = emailBrandHeader(branding);
  const bodyTag = /<body[^>]*>/i.exec(body);
  if (bodyTag) {
    const at = bodyTag.index + bodyTag[0].length;
    return body.slice(0, at) + header + body.slice(at);
  }
  return header + body;
}
