import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID!;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET!;
const BASIC_AUTH = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

export async function GET() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("spotify_access_token")?.value;
  const refreshToken = cookieStore.get("spotify_refresh_token")?.value;

  // 1️⃣ Wenn gültiger Access Token existiert → direkt zurückgeben
  if (accessToken) {
    return NextResponse.json({ access_token: accessToken });
  }

  // 2️⃣ Wenn kein Refresh Token vorhanden → Fehler
  if (!refreshToken) {
    return NextResponse.json({ error: "No refresh token" }, { status: 401 });
  }

  // 3️⃣ Token mit Refresh Token erneuern
  try {
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${BASIC_AUTH}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Spotify refresh failed:", data);
      return NextResponse.json({ error: data.error_description || "Refresh failed" }, { status: 400 });
    }

    // 4️⃣ Access Token im Cookie speichern
    const res = NextResponse.json({ access_token: data.access_token });
    res.cookies.set("spotify_access_token", data.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: data.expires_in, // i.d.R. 3600 Sekunden
    });

    return res;
  } catch (err: any) {
    console.error("Token refresh error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
