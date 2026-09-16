// src/app/lib/providers/spotify/artistTopTracks.ts
//
// Top-Tracks eines Künstlers (Story D1).
//
// Baustein für den Kandidatenpool des Empfehlungs-Features: Titel von
// Künstlern, die in der Party gerade gut ankommen, sind naheliegende
// Vorschläge für neue Songs.
//
// GET /v1/artists/{id}/top-tracks ist weiterhin nutzbar (anders als
// Recommendations, Audio Features/Analysis, Related Artists, Featured
// Playlists — siehe Hard Constraints des Features). Wie bei den
// Genre-Schätzungen aus Story B2 genügt dafür das App-Token: die Daten
// hängen an keinem Gastgeber-Konto.

import { spotifyClientCredentialsFetch } from "./auth";
import type { Track } from "../types";

export async function getArtistTopTracks(artistId: string): Promise<Track[]> {
  if (!artistId) return [];

  const url = `https://api.spotify.com/v1/artists/${encodeURIComponent(artistId)}/top-tracks?market=DE`;

  let response: Response;
  try {
    response = await spotifyClientCredentialsFetch(url, { cache: "no-store" });
  } catch (error) {
    console.warn(`[artist-top-tracks] Abruf für ${artistId} fehlgeschlagen:`, error);
    return [];
  }

  if (!response.ok) {
    console.warn(`[artist-top-tracks] /v1/artists/${artistId}/top-tracks antwortete mit ${response.status}`);
    return [];
  }

  const data = await response.json().catch(() => null);
  const tracks = Array.isArray(data?.tracks) ? data.tracks : [];

  return tracks
    .filter((item: any) => item?.id && item?.uri)
    .map((item: any) => ({
      id: item.id,
      name: item.name,
      artist: (item.artists || []).map((a: any) => a.name).join(", "),
      uri: item.uri,
      previewUrl: item.preview_url ?? null,
      albumArt: item.album?.images?.[0]?.url,
      durationMs: item.duration_ms,
      progressMs: 0,
      isplaying: false,
      explicit: Boolean(item.explicit),
    }));
}
