import { spotifyApiFetch, spotifyClientCredentialsFetch } from "./auth";
import { Playlist, Track } from "../types";

export async function getPlaylists(): Promise<Playlist[]> {
  const res = await spotifyApiFetch("https://api.spotify.com/v1/me/playlists?limit=50", {
    cache: "no-store", // Edge-Caching verhindern
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Spotify /me/playlists error:", res.status, err);
    throw new Error("Failed to fetch playlists");
  }

  const data = await res.json();
  // Optional: loggen, um zu sehen, was Spotify sendet
  // console.log("total:", data.total, "returned:", data.items.length, "next:", data.next);

  

  return data.items.map((item: any) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      imageUrl: item.images?.[0]?.url,
      uri: item.uri,
  }));
}



export async function getPlaylistTracks(
  playlistId: string,
  offset = 0,
  limit = 50
): Promise<{ tracks: Track[]; next: string | null }> {
  const res = await spotifyApiFetch(
    `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=${limit}&offset=${offset}`,
    {}
  );

  if (!res.ok) {
    console.error("Fehler beim Laden der Playlist:", await res.text());
    return { tracks: [], next: null };
  }

  const data = await res.json();

  const tracks = data.items
    .filter((item: any) => item.track && item.track.id)
    .map((item: any) => ({
      id: item.track.id,
      name: item.track.name,
      artist: item.track.artists.map((a: any) => a.name).join(", "),
      uri: item.track.uri,
      previewUrl: item.track.preview_url ?? null,
      albumArt: item.track.album.images?.[0]?.url,
      durationMs: item.track.duration_ms,
      progressMs: 0,
      isplaying: false,
      explicit: Boolean(item.track.explicit),
    }));

  return { tracks, next: data.next };
}



export async function playPlaylist(playlistId: string): Promise<void> {
  await spotifyApiFetch("https://api.spotify.com/v1/me/player/play", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ context_uri: `spotify:playlist:${playlistId}` }),
  });
}


export async function playTrackList(uris: string[]) {
  await spotifyApiFetch("https://api.spotify.com/v1/me/player/play", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uris }),
  });
}

export async function searchTracks(
  query: string,
  limit = 50
): Promise<Track[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const safeLimit = Math.min(50, Math.max(1, limit));

  const buildParams = (withMarketFromToken: boolean) => {
    const params = new URLSearchParams({
      q: trimmed,
      type: "track",
      limit: String(safeLimit),
    });
    if (withMarketFromToken) {
      params.set("market", "from_token");
    }
    return params;
  };

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const shouldRetry = (status: number) =>
    status === 429 || status === 500 || status === 502 || status === 503 || status === 504;

  const fetchSearch = async (
    withMarketFromToken: boolean,
    options?: { useClientCredentials?: boolean }
  ) => {
    const useClientCredentials = Boolean(options?.useClientCredentials);
    let lastResponse: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const params = buildParams(
        useClientCredentials ? false : withMarketFromToken
      ).toString();
      const requestUrl = `https://api.spotify.com/v1/search?${params}`;
      const response = useClientCredentials
        ? await spotifyClientCredentialsFetch(requestUrl, { cache: "no-store" })
        : await spotifyApiFetch(requestUrl, { cache: "no-store" });
      lastResponse = response;
      if (!shouldRetry(response.status) || attempt === 2) break;

      const retryAfter = Number(response.headers.get("retry-after"));
      const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : 300 * Math.pow(2, attempt);
      await sleep(delayMs);
    }
    return lastResponse!;
  };

  let res = await fetchSearch(true);

  // Fallback: manche Konten/Token liefern bei market=from_token inkonsistente Fehler.
  if (!res.ok && (res.status === 400 || res.status === 404 || res.status === 422)) {
    res = await fetchSearch(false);
  }

  // Fallback auf App-Token, falls User-Session/Scopes instabil sind.
  if (!res.ok && (res.status === 401 || res.status === 403)) {
    res = await fetchSearch(false, { useClientCredentials: true });
  }

  // Letzter Fallback für Sonderzeichen-lastige Queries.
  if (!res.ok && trimmed.includes(":")) {
    const simplifiedQuery = trimmed.replace(/:+/g, " ").replace(/\s+/g, " ").trim();
    if (simplifiedQuery) {
      const fallbackParams = new URLSearchParams({
        q: simplifiedQuery,
        type: "track",
        limit: String(safeLimit),
      });
      res = await spotifyApiFetch(
        `https://api.spotify.com/v1/search?${fallbackParams.toString()}`,
        { cache: "no-store" }
      );
    }
  }

  if (!res.ok) {
    const details = await res.text();
    console.error("Fehler bei Spotify Suche:", res.status, details);
    const error = new Error("Spotify search failed") as Error & {
      status?: number;
      details?: string;
    };
    error.status = res.status;
    error.details = details;
    throw error;
  }

  const data = await res.json();
  const items = data?.tracks?.items ?? [];

  const normalizedQuery = trimmed.toLowerCase();
  const scored = items
    .filter((item: any) => item?.id && item?.uri)
    .map((item: any) => {
      const name = String(item.name || "");
      const artistNames = (item.artists || []).map((a: any) => String(a.name || ""));
      const nameLower = name.toLowerCase();
      const artistCombinedLower = artistNames.join(" ").toLowerCase();

      let score = item.popularity ?? 0;
      if (nameLower === normalizedQuery) score += 500;
      else if (nameLower.startsWith(normalizedQuery)) score += 250;
      else if (nameLower.includes(normalizedQuery)) score += 120;

      if (artistCombinedLower.includes(normalizedQuery)) score += 80;

      return { item, score };
    })
    .sort((a: any, b: any) => b.score - a.score);

  return scored.map(({ item }: any) => ({
    id: item.id,
    name: item.name,
    artist: item.artists.map((a: any) => a.name).join(", "),
    uri: item.uri,
    previewUrl: item.preview_url ?? null,
    albumArt: item.album?.images?.[0]?.url,
    durationMs: item.duration_ms,
    progressMs: 0,
    isplaying: false,
    explicit: Boolean(item.explicit),
  }));
}
