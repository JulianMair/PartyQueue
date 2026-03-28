import { spotifyClientCredentialsFetch } from "./auth";

type PreviewCacheEntry = {
  value: string | null;
  expiresAt: number;
};

const previewCache = new Map<string, PreviewCacheEntry>();
const PREVIEW_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const PREVIEW_MARKETS = ["DE", "AT", "CH", "US", "GB"] as const;

function getCachedPreview(trackId: string): string | null | undefined {
  const entry = previewCache.get(trackId);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    previewCache.delete(trackId);
    return undefined;
  }
  return entry.value;
}

function setCachedPreview(trackId: string, value: string | null) {
  previewCache.set(trackId, {
    value,
    expiresAt: Date.now() + PREVIEW_CACHE_TTL_MS,
  });
}

export async function resolvePreviewUrlsForTracks(
  trackIds: string[]
): Promise<Record<string, string | null>> {
  const uniqueIds = Array.from(new Set(trackIds.filter(Boolean)));
  if (uniqueIds.length === 0) return {};

  const result: Record<string, string | null> = {};
  const missingIds: string[] = [];

  for (const trackId of uniqueIds) {
    const cached = getCachedPreview(trackId);
    if (cached !== undefined) {
      result[trackId] = cached;
    } else {
      missingIds.push(trackId);
    }
  }

  for (let i = 0; i < missingIds.length; i += 50) {
    const batch = missingIds.slice(i, i + 50);
    const pending = new Set(batch);
    const collected: Record<string, string | null> = {};

    const tryFetchForMarket = async (market?: string) => {
      const params = new URLSearchParams({ ids: Array.from(pending).join(",") });
      if (market) params.set("market", market);

      const res = await spotifyClientCredentialsFetch(
        `https://api.spotify.com/v1/tracks?${params.toString()}`,
        { cache: "no-store" }
      );
      if (!res.ok) return;

      const data = await res.json().catch(() => ({}));
      const tracks = Array.isArray(data?.tracks) ? data.tracks : [];
      for (const track of tracks) {
        const id = typeof track?.id === "string" ? track.id : "";
        if (!id || !pending.has(id)) continue;
        const previewUrl =
          typeof track?.preview_url === "string" && track.preview_url.length > 0
            ? track.preview_url
            : null;

        if (previewUrl) {
          collected[id] = previewUrl;
          pending.delete(id);
        } else if (!(id in collected)) {
          collected[id] = null;
        }
      }
    };

    // First: default response (without explicit market), then fallback markets.
    await tryFetchForMarket(undefined);
    if (pending.size > 0) {
      for (const market of PREVIEW_MARKETS) {
        await tryFetchForMarket(market);
        if (pending.size === 0) break;
      }
    }

    for (const trackId of batch) {
      const preview = collected[trackId] ?? null;
      setCachedPreview(trackId, preview);
      result[trackId] = preview;
    }
  }

  return result;
}
