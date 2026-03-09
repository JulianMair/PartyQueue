import { NextResponse } from "next/server";
import { getProvider } from "@/app/lib/providers/factory";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    if (!q) {
      return NextResponse.json({ tracks: [] });
    }

    const provider = getProvider("spotify");
    const tracks = await provider.searchTracks(q, Number.isNaN(limit) ? 50 : limit);

    return NextResponse.json({ tracks });
  } catch (error: any) {
    console.error("Search tracks error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to search tracks" },
      { status: 500 }
    );
  }
}
