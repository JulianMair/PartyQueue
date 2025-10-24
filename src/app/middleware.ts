import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const token = req.cookies.get("spotify_access_token")?.value;

  // Middleware nur auf /dashboard anwenden
  if (req.nextUrl.pathname.startsWith("/dashboard") && !token) {
    const loginUrl = new URL("/", req.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"], // nur Dashboard schützen
};
