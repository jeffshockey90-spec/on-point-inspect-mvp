import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request,
  });

  const pathname = request.nextUrl.pathname;

  const publicRoutes = [
    "/",
    "/login",
    "/signup",
    "/api",
    "/share",
    "/client",
    "/client-portal",
    "/client-agreement",
    "/forgot-password",
    "/reset-password",
  ];

  const isPublicRoute = publicRoutes.some((route) =>
    route === "/" ? pathname === "/" : pathname.startsWith(route)
  );

  if (isPublicRoute) {
    return response;
  }

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
            request,
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

  const protectedRoutes = [
    "/dashboard",
    "/reports",
    "/new",
    "/inspections",
    "/ai-capture",
    "/equipment-test",
    "/field",
    "/field-tool",
    "/repair-request",
  ];

  const authRoutes = ["/login", "/signup"];

  const isProtected = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  );

  if (isProtected && !user) {
    const url = request.nextUrl.clone();

    url.pathname = "/login";
    url.searchParams.set("redirectedFrom", pathname);

    return NextResponse.redirect(url);
  }

  if (authRoutes.includes(pathname) && user) {
    const url = request.nextUrl.clone();

    url.pathname = "/dashboard";

    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};