import { NextResponse } from "next/server";
import { getProvider } from "@/app/lib/providers/factory";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const requestedLimit = parseInt(searchParams.get("limit") || "25", 10);
    const limit = Number.isNaN(requestedLimit)
      ? 25
      : Math.min(50, Math.max(1, requestedLimit));

    if (q.length < 2) {
      return NextResponse.json({ tracks: [], minQueryLength: 2 });
    }

    const provider = getProvider("spotify");
    const tracks = await provider.searchTracks(q, limit);

    return NextResponse.json({ tracks, query: q, limit });
  } catch (error: any) {
    console.error("Search tracks error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to search tracks" },
      { status: 500 }
    );
  }
}
