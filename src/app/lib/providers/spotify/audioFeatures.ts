// src/app/lib/providers/spotify/audioFeatures.ts
//
// Rückfallverfahren für Audio-Merkmale (Story B2).
//
// Springt ein, wenn der eigentliche Merkmals-Dienst nichts liefert — sei
// es weil er ausgefallen ist, zu lange braucht oder einen Titel nicht
// kennt. Dann werden die Werte aus den Genres der beteiligten Künstler
// geschätzt.
//
// Zwei Schritte, beide als Sammelabfrage:
//   1. GET /v1/tracks?ids=...    liefert je Titel die beteiligten Künstler
//   2. GET /v1/artists?ids=...   liefert je Künstler die Genres
//
// Beide Endpunkte sind weiterhin nutzbar. Die für Merkmale, Analyse,
// Empfehlungen und verwandte Künstler sind es nicht und werden hier
// bewusst nicht angefasst.
//
// Genutzt wird das App-Token (Client Credentials), nicht die Anmeldung
// eines Gastgebers: die Daten sind öffentlich und hängen an keinem Konto.

import { spotifyClientCredentialsFetch } from "./auth";
import { estimateFromGenres } from "./genreHeuristics";
import type { AudioFeatureProvider, AudioFeatures } from "../types";

/** Spotify erlaubt bei beiden Endpunkten bis zu 50 Kennungen je Anfrage. */
const BATCH_SIZE = 50;

/**
 * Holt zu mehreren Titeln die Kennungen der beteiligten Künstler.
 *
 * Ein Titel kann mehrere Künstler haben. Alle werden gesammelt, weil bei
 * einer Zusammenarbeit beide Genres zur Einordnung beitragen.
 */
async function fetchArtistIdsPerTrack(
  trackIds: string[]
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();

  for (let start = 0; start < trackIds.length; start += BATCH_SIZE) {
    const batch = trackIds.slice(start, start + BATCH_SIZE);
    const url = `https://api.spotify.com/v1/tracks?ids=${encodeURIComponent(batch.join(","))}`;

    try {
      const response = await spotifyClientCredentialsFetch(url, { cache: "no-store" });
      if (!response.ok) {
        console.warn(`[spotify-fallback] /v1/tracks antwortete mit ${response.status}`);
        continue;
      }
      const data = await response.json().catch(() => null);
      const tracks = Array.isArray(data?.tracks) ? data.tracks : [];

      for (const track of tracks) {
        // Spotify liefert fuer unbekannte Kennungen null an der Stelle.
        if (!track || typeof track.id !== "string") continue;
        const artistIds = Array.isArray(track.artists)
          ? track.artists
              .map((artist: unknown) =>
                artist && typeof artist === "object"
                  ? (artist as Record<string, unknown>).id
                  : null
              )
              .filter((id: unknown): id is string => typeof id === "string")
          : [];
        result.set(track.id, artistIds);
      }
    } catch (error) {
      console.warn("[spotify-fallback] Abruf der Titel fehlgeschlagen:", error);
    }
  }

  return result;
}

/** Holt zu mehreren Künstlern deren Genres. */
async function fetchGenresPerArtist(artistIds: string[]): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();

  for (let start = 0; start < artistIds.length; start += BATCH_SIZE) {
    const batch = artistIds.slice(start, start + BATCH_SIZE);
    const url = `https://api.spotify.com/v1/artists?ids=${encodeURIComponent(batch.join(","))}`;

    try {
      const response = await spotifyClientCredentialsFetch(url, { cache: "no-store" });
      if (!response.ok) {
        console.warn(`[spotify-fallback] /v1/artists antwortete mit ${response.status}`);
        continue;
      }
      const data = await response.json().catch(() => null);
      const artists = Array.isArray(data?.artists) ? data.artists : [];

      for (const artist of artists) {
        if (!artist || typeof artist.id !== "string") continue;
        const genres = Array.isArray(artist.genres)
          ? artist.genres.filter((genre: unknown): genre is string => typeof genre === "string")
          : [];
        result.set(artist.id, genres);
      }
    } catch (error) {
      console.warn("[spotify-fallback] Abruf der Künstler fehlgeschlagen:", error);
    }
  }

  return result;
}

export class SpotifyFallbackFeatureProvider implements AudioFeatureProvider {
  readonly name = "spotify-fallback";

  /**
   * Schätzt die Merkmale der angefragten Titel aus den Genres ihrer
   * Künstler.
   *
   * Anders als beim Hauptanbieter genügen hier zwei Sammelabfragen für bis
   * zu 50 Titel — deshalb kommt dieses Verfahren ohne Zwischenspeicher aus.
   *
   * Titel, zu denen sich nichts ermitteln lässt, stehen mit null im
   * Ergebnis. Ein Titel ohne brauchbare Genres bekommt dagegen neutrale
   * Mittelwerte: er ist bekannt, nur nicht einzuordnen.
   */
  async getAudioFeatures(trackIds: string[]): Promise<Map<string, AudioFeatures | null>> {
    const result = new Map<string, AudioFeatures | null>();
    if (!Array.isArray(trackIds) || trackIds.length === 0) return result;

    const uniqueIds = Array.from(
      new Set(trackIds.filter((id) => typeof id === "string" && id.length > 0))
    );
    if (uniqueIds.length === 0) return result;

    // Schritt 1: Welche Künstler gehören zu welchem Titel?
    const artistIdsPerTrack = await fetchArtistIdsPerTrack(uniqueIds);

    // Schritt 2: Genres aller beteiligten Künstler auf einmal holen.
    const allArtistIds = Array.from(
      new Set(Array.from(artistIdsPerTrack.values()).flat())
    );
    const genresPerArtist =
      allArtistIds.length > 0 ? await fetchGenresPerArtist(allArtistIds) : new Map<string, string[]>();

    // Schritt 3: je Titel die Genres zusammenwerfen und schätzen.
    for (const trackId of uniqueIds) {
      const artistIds = artistIdsPerTrack.get(trackId);
      if (!artistIds) {
        // Titel war Spotify unbekannt.
        result.set(trackId, null);
        continue;
      }

      const genres = artistIds.flatMap((artistId) => genresPerArtist.get(artistId) ?? []);
      const estimate = estimateFromGenres(genres);
      result.set(trackId, { ...estimate, source: "estimated" });
    }

    return result;
  }
}
