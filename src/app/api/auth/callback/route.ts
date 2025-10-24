import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID!;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET!;
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI!;

// Wird von Spotify aufgerufen nach erfolgreichem Login
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "Missing authorization code" }, { status: 400 });
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
  });

  const data = await response.json();

  if (data.error) {
    console.error("Spotify Auth Error:", data);
    return NextResponse.json({ error: data.error_description }, { status: 400 });
  }

  // Access + Refresh Token als HttpOnly Cookies speichern
  const res = NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/dashboard`);
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production", // nur HTTPS in Produktion
    sameSite: "lax" as const,
    path: "/",
  };




  // Token in Cookies speichern
  res.cookies.set("spotify_access_token", data.access_token, {
    ...cookieOptions,
    maxAge: data.expires_in, // meist 3600 Sekunden
  });

  if (data.refresh_token) {
    res.cookies.set("spotify_refresh_token", data.refresh_token, {
      ...cookieOptions,
      maxAge: 30 * 24 * 60 * 60, // 30 Tage
    });
  }

  return res;
}
