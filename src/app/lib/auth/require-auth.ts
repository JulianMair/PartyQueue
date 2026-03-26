import { NextResponse } from "next/server";
import { getSpotifyToken } from "@/app/lib/providers/spotify/auth";

export async function requireAuthenticatedRequest() {
  try {
    await getSpotifyToken();
    return null;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
