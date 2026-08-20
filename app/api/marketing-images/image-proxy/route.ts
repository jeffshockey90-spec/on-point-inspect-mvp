import { NextResponse } from "next/server";
import { createClient } from "../../../../utils/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Server-side image proxy for the Marketing Studio. The browser can't fetch some
// property-photo sources directly (Google Street View / Places images don't send
// CORS headers), which broke "Could not fetch image" and left the canvas unable
// to draw/download them. Fetching server-side sidesteps CORS and keeps the canvas
// untainted. Locked down: auth required + host allowlist to prevent open-proxy /
// SSRF abuse.
const ALLOWED_HOST_SUFFIXES = [
  ".supabase.co",
  ".supabase.in",
  ".googleapis.com",
  ".gstatic.com",
  ".googleusercontent.com",
  ".google.com",
  ".ggpht.com",
];

function hostAllowed(hostname: string) {
  const host = hostname.toLowerCase();
  return ALLOWED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const raw = new URL(request.url).searchParams.get("url") || "";

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: "Invalid url." }, { status: 400 });
  }

  if (target.protocol !== "https:" && target.protocol !== "http:") {
    return NextResponse.json({ error: "Unsupported protocol." }, { status: 400 });
  }
  if (!hostAllowed(target.hostname)) {
    return NextResponse.json({ error: "Image host not allowed." }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      cache: "no-store",
      headers: { Accept: "image/*" },
    });
  } catch {
    return NextResponse.json({ error: "Could not fetch image." }, { status: 502 });
  }

  if (!upstream.ok) {
    return NextResponse.json(
      { error: "Could not fetch image." },
      { status: upstream.status === 404 ? 404 : 502 },
    );
  }

  const contentType = upstream.headers.get("content-type") || "image/jpeg";
  if (!contentType.toLowerCase().startsWith("image/")) {
    return NextResponse.json({ error: "Not an image." }, { status: 415 });
  }

  const bytes = new Uint8Array(await upstream.arrayBuffer());
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=300",
    },
  });
}
