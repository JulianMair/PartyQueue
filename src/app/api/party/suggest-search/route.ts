import { NextResponse } from "next/server";
import { spotifyClientCredentialsFetch } from "@/app/lib/providers/spotify/auth";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() ?? "";
    const limitParam = Math.min(10, Math.max(1, Number(searchParams.get("limit")) || 10));

    if (q.length < 2) {
      return NextResponse.json({ error: "Query zu kurz" }, { status: 400 });
    }

    const url = `https://api.spotify.com/v1/search?${new URLSearchParams({
      q,
      type: "track",
      limit: String(limitParam),
      market: "DE",
    })}`;

    const res = await spotifyClientCredentialsFetch(url);
    if (!res.ok) {
      return NextResponse.json({ error: "Spotify-Suche fehlgeschlagen" }, { status: 502 });
    }

    const data = await res.json();
    const tracks = (data.tracks?.items ?? []).map((item: any) => ({
      id: item.id,
      name: item.name,
      artist: item.artists?.map((a: any) => a.name).join(", ") ?? "",
      uri: item.uri,
      albumArt: item.album?.images?.[0]?.url ?? undefined,
      durationMs: item.duration_ms,
      explicit: item.explicit ?? false,
    }));

    return NextResponse.json({ tracks });
  } catch (err) {
    console.error("[suggest-search] Error:", err);
    return NextResponse.json({ error: "Suchfehler" }, { status: 500 });
  }
}
