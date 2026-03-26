import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { clearSpotifyAuthCookies } from "@/app/lib/providers/spotify/auth";

const OAUTH_STATE_COOKIE = "spotify_oauth_state";

// Wird von Spotify aufgerufen nach erfolgreichem Login
export async function GET(req: Request) {
  const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
  const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
  const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI;
  const APP_BASE_URL =
    process.env.NEXT_PUBLIC_BASE_URL || new URL(req.url).origin;

  if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
    return NextResponse.json(
      { error: "Spotify OAuth ist nicht korrekt konfiguriert" },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(req.url);
  const oauthError = searchParams.get("error");
  if (oauthError) {
    return NextResponse.redirect(
      `${APP_BASE_URL}/?authError=${encodeURIComponent(oauthError)}`
    );
  }

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
  cookieStore.delete(OAUTH_STATE_COOKIE);

  if (!code || !state || !expectedState || state !== expectedState) {
    await clearSpotifyAuthCookies();
    return NextResponse.redirect(
      `${APP_BASE_URL}/?authError=${encodeURIComponent("invalid_oauth_state")}`
    );
  }

  // Spotify Access Token holen
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64"),
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
    }),
    cache: "no-store",
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.error || typeof data?.access_token !== "string") {
    console.error("Spotify Auth Error:", data);
    await clearSpotifyAuthCookies();
    return NextResponse.redirect(
      `${APP_BASE_URL}/?authError=${encodeURIComponent(
        data?.error_description || data?.error || "oauth_token_exchange_failed"
      )}`
    );
  }

  // Access + Refresh Token als HttpOnly Cookies speichern
  const res = NextResponse.redirect(`${APP_BASE_URL}/dashboard`);
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };

  // Token in Cookies speichern
  res.cookies.set("spotify_access_token", data.access_token, {
    ...cookieOptions,
    maxAge: Math.max(60, Number(data.expires_in) || 3600),
  });
  res.cookies.set(
    "spotify_access_token_expires_at",
    String(Date.now() + Math.max(60, Number(data.expires_in) || 3600) * 1000),
    {
      ...cookieOptions,
      maxAge: Math.max(60, Number(data.expires_in) || 3600) + 300,
    }
  );

  if (data.refresh_token) {
    res.cookies.set("spotify_refresh_token", data.refresh_token, {
      ...cookieOptions,
      maxAge: 30 * 24 * 60 * 60, // 30 Tage
    });
  }

  return res;
}
