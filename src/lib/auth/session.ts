import type { NextRequest } from "next/server";
import { cookies } from "next/headers";

export async function hasAuthSession(): Promise<boolean> {
  const cookieStore = await cookies();
  return Boolean(
    cookieStore.get("spotify_access_token")?.value ||
      cookieStore.get("spotify_refresh_token")?.value
  );
}

export function hasAuthSessionFromRequest(req: NextRequest): boolean {
  return Boolean(
    req.cookies.get("spotify_access_token")?.value ||
      req.cookies.get("spotify_refresh_token")?.value
  );
}
