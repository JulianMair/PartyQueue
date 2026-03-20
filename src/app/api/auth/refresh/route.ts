import { NextResponse } from "next/server";
import { refreshSpotifyAccessToken } from "@/app/lib/providers/spotify/auth";

export async function GET() {
  const accessToken = await refreshSpotifyAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "No refresh token found" }, { status: 401 });
  }
  return NextResponse.json({ success: true });
}
