import { NextResponse } from "next/server";
import { getProvider } from "@/app/lib/providers/factory";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const provider = getProvider("spotify");
    const tracks = await provider.getPlaylistTracks(params.id);
    return NextResponse.json(tracks);
  } catch (err: any) {
    console.error("Playlist tracks error:", err);
    return NextResponse.json(
      { error: "Failed to fetch tracks" },
      { status: 500 }
    );
  }
}
