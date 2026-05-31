import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export default async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });

          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  const isPublicRoute =
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/share") ||
    pathname.startsWith("/environmental-share") ||
    pathname.startsWith("/client") ||
    pathname.startsWith("/client-portal") ||
    pathname.startsWith("/client-agreement") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password");

  const protectedRoutes = [
    "/dashboard",
    "/reports",
    "/inspections",
    "/ai-capture",
    "/equipment-test",
    "/equipment-analyzer",
    "/field",
    "/field-tool",
    "/repair-request",
    "/agreements",
    "/templates",
    "/schedule",
    "/quotes",
    "/invoices",
    "/analytics",
    "/radon",
    "/mold",
    "/environmental-report",
  ];

  const isProtected = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  );

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectedFrom", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next|favicon.ico|manifest.json|robots.txt|sitemap.xml|icons|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml|json)$).*)",
  ],
};