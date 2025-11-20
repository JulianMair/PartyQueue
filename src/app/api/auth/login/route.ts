import { NextResponse } from "next/server";

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID!;
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI!;
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
  const queryParams = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    scope: SCOPES,
    redirect_uri: encodeURIComponent(REDIRECT_URI),
  });

  console.log("➡️ REDIRECT_URI SENT TO SPOTIFY:", REDIRECT_URI);

  const spotifyAuthUrl = `https://accounts.spotify.com/authorize?${queryParams.toString()}`;

  return NextResponse.redirect(spotifyAuthUrl);
}
