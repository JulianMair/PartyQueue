import { NextResponse } from "next/server";
import { getSpotifyToken, spotifyApiFetch } from "@/app/lib/providers/spotify/auth";

export async function requireAuthenticatedRequest() {
  try {
    await getSpotifyToken();
    return null;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

/** Returns the Spotify user ID of the currently authenticated user, or null. */
export async function getCurrentSpotifyUserId(): Promise<string | null> {
  try {
    const res = await spotifyApiFetch("https://api.spotify.com/v1/me");
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.id === "string" ? data.id : null;
  } catch {
    return null;
  }
}
