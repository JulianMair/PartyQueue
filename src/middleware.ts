import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { hasAuthSessionFromRequest } from "@/lib/auth/session";

const PUBLIC_API_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/callback",
  "/api/auth/token",
  "/api/auth/refresh",
  "/api/party/mobile",
  "/api/party/vote",
  "/api/party/join",
  "/api/party/display",
  "/api/party/suggest",
  "/api/party/suggest-vote",
  "/api/party/suggest-search",
]);

function isPublicApiPath(pathname: string): boolean {
  return PUBLIC_API_PATHS.has(pathname);
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isAuthenticated = hasAuthSessionFromRequest(req);

  if (pathname.startsWith("/dashboard") && !isAuthenticated) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  if (pathname.startsWith("/api/")) {
    if (isPublicApiPath(pathname)) {
      return NextResponse.next();
    }

    if (!isAuthenticated) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*"],
};
