import { NextResponse } from "next/server";
import { getSpotifyToken } from "@/app/lib/providers/spotify/auth";

export async function GET() {
  try {
    const accessToken = await getSpotifyToken();
    return NextResponse.json({ access_token: accessToken });
  } catch (err) {
    console.error("Token refresh error:", err);
    return NextResponse.json({ error: "No token" }, { status: 401 });
  }
}
