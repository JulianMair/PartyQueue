import { NextResponse } from "next/server";
import { getProvider } from "@/app/lib/providers/factory";
import { requireAuthenticatedRequest } from "@/app/lib/auth/require-auth";

export async function GET(req: Request) {
  try {
    const unauthorized = await requireAuthenticatedRequest();
    if (unauthorized) return unauthorized;

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
    const status =
      typeof error?.status === "number" && error.status >= 400 && error.status < 600
        ? error.status
        : 500;
    const message =
      status === 401
        ? "Spotify session expired"
        : status === 429
        ? "Spotify rate limit reached, please retry in a moment"
        : status >= 500
        ? "Spotify search temporarily unavailable"
        : error?.message || "Failed to search tracks";
    return NextResponse.json(
      {
        error: message,
        providerError:
          typeof error?.details === "string" && error.details.length > 0
            ? error.details
            : undefined,
      },
      { status }
    );
  }
}
