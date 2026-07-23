import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getAppUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    "https://app.flowinspect.app"
  );
}

export async function GET() {
  return NextResponse.redirect(`${getAppUrl()}/api/stripe/connect/onboard`);
}
