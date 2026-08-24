import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Backwards-compatible redirect. Earlier report PDFs generated a QR code / link
// to /public-report/<token>, but that route never existed, so scanners landed on
// the login screen. The real public (no-login) report lives at /share/<token>.
// New PDFs link straight to /share, and this rescues any already-distributed QRs.
export default async function PublicReportRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const sp = searchParams ? await searchParams : {};

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (typeof value === "string") query.set(key, value);
    else if (Array.isArray(value) && value[0]) query.set(key, value[0]);
  }
  const qs = query.toString();

  redirect(`/share/${encodeURIComponent(token)}${qs ? `?${qs}` : ""}`);
}
