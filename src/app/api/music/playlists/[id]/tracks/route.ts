import { NextResponse } from "next/server";
import { getProvider } from "@/app/lib/providers/factory";

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> } // <-- Promise hier
) {
  try {
    const { id } = await context.params; // <-- params awaiten
    const { searchParams } = new URL(req.url);
    const offset = parseInt(searchParams.get("offset") || "0");
    const limit = parseInt(searchParams.get("limit") || "50");

    const provider = getProvider("spotify");
    const { tracks, next } = await provider.getPlaylistTracks(id, offset, limit);

    return NextResponse.json({ tracks, next });
  } catch (err: any) {
    console.error("Playlist tracks error:", err);
    return NextResponse.json(
      { error: "Failed to fetch tracks" },
      { status: 500 }
    );
  }
}
