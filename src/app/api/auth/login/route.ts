import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";

const OAUTH_STATE_COOKIE = "spotify_oauth_state";
const SCOPES = [
"user-read-playback-state",
"user-modify-playback-state",
"user-read-currently-playing",
"streaming",
"app-remote-control",
"playlist-read-private",
"playlist-read-collaborative",
].join(" ");

export async function GET() {
  const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
  const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI;
  if (!CLIENT_ID || !REDIRECT_URI) {
    return NextResponse.json(
      { error: "Spotify OAuth ist nicht korrekt konfiguriert" },
      { status: 500 }
    );
  }

  const oauthState = randomBytes(24).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set(OAUTH_STATE_COOKIE, oauthState, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });

  const queryParams = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    scope: SCOPES,
    redirect_uri: REDIRECT_URI,
    state: oauthState,
    show_dialog: "true",
  });

  const spotifyAuthUrl = `https://accounts.spotify.com/authorize?${queryParams.toString()}`;

  return NextResponse.redirect(spotifyAuthUrl);
}
