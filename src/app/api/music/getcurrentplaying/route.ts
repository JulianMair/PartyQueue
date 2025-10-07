import { NextResponse } from "next/server";
import { SpotifyProvider } from "../../../lib/providers/spotify/index";
import { getProvider } from "../../../lib/providers/factory";

export async function GET() {
  try {
    const provider = getProvider("spotify");
    const track = await provider.getCurrentTrack();
    console.log("Spotify current track:", track);
    return NextResponse.json(track);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
}
