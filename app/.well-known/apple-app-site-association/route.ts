import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Put this at: app/.well-known/apple-app-site-association/route.ts
// IMPORTANT: Replace TEAMID.com.your.bundle.id with your real Apple Team ID + iOS bundle ID.
// This keeps /public-report/* browser-only so QR scans do NOT open the iOS app login.

export async function GET() {
  return NextResponse.json(
    {
      applinks: {
        apps: [],
        details: [
          {
            appIDs: ["TEAMID.com.your.bundle.id"],
            components: [
              {
                "/": "/public-report/*",
                exclude: true,
                comment: "Keep public report QR links in Safari/browser, not the iOS app.",
              },
              {
                "/": "/share/*",
                exclude: true,
                comment: "Keep legacy public share links in Safari/browser, not the iOS app.",
              },
              {
                "/": "/reports/*",
                comment: "Allow authenticated report links to open the app.",
              },
              {
                "/": "/dashboard/*",
                comment: "Allow dashboard links to open the app.",
              },
              {
                "/": "/client-portal/*",
                comment: "Allow client portal links to open the app only if you want this behavior.",
              },
            ],
          },
        ],
      },
    },
    {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
      },
    }
  );
}
