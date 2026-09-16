// src/app/lib/party/candidatePool.ts
//
// Erzeugt einen Kandidatenpool für das Empfehlungs-Feature (Story D1).
//
// Zwei Quellen, wie in der Algorithmus-Referenz des Features festgelegt:
//   1. Top-Tracks der Künstler, die in der Party gerade "angesagt" sind
//      (häufig unter den zuletzt gespielten Titeln).
//   2. Suche nach den in den Party-Einstellungen gewählten Genres.
//
// Wichtig: Diese Datei wird an keiner Stelle automatisch aufgerufen. Sie
// stellt nur die Fähigkeit bereit — das Ranking (Story D2) und das
// tatsächliche Einreihen (Story D3) kommen erst noch. Die bestehende
// Auto-Fill-Logik in PartyRegistry bleibt unverändert.
//
// Wie bei Story B2 wird die Auflösung Track-ID → Künstler-ID direkt aus
// providers/spotify/audioFeatures.ts wiederverwendet: das ist Spotify-
// spezifisches "Katalog"-Wissen, kein Teil der generischen
// MusicProvider-Schnittstelle (Wiedergabe), genau wie die
// Genre-Schätzung dort auch außerhalb der Provider-Abstraktion steht.

import type { PartyManager } from "./PartyManager";
import type { MusicProvider, Track } from "../providers/types";
import type { PartyGenre } from "./settings";
import { fetchArtistIdsPerTrack } from "../providers/spotify/audioFeatures";

/** Wie viele der zuletzt gespielten Titel für die Künstler-Ermittlung zählen. */
export const RECENT_ARTIST_WINDOW = 15;

/** Wie viele Künstler als "angesagt" gelten und Top-Tracks liefern. */
export const TOP_TRENDING_ARTISTS = 5;

/** Wie viele Treffer pro Genre-Suche angefragt werden. */
const GENRE_SEARCH_LIMIT = 30;

/**
 * Bestimmt die "angesagten" Künstler aus den zuletzt gespielten Titeln.
 *
 * Reine Funktion: zählt, wie oft jeder Künstler unter den übergebenen
 * Titeln vorkommt (ein Titel mit mehreren Künstlern zählt für jeden).
 * Bei Gleichstand gewinnt, wer zuletzt vorkam — trackIdsOldestFirst muss
 * dafür chronologisch (ältester zuerst) sein, wie playedTracks es liefert.
 *
 * @param trackIdsOldestFirst Zuletzt gespielte Titel, ältester zuerst.
 * @param artistIdsByTrack    Track-ID → beteiligte Künstler-IDs.
 * @param topK                Wie viele Künstler zurückkommen sollen.
 */
export function pickTrendingArtistIds(
  trackIdsOldestFirst: string[],
  artistIdsByTrack: Map<string, string[]>,
  topK: number = TOP_TRENDING_ARTISTS
): string[] {
  const countByArtist = new Map<string, number>();
  const lastIndexByArtist = new Map<string, number>();

  trackIdsOldestFirst.forEach((trackId, index) => {
    const artistIds = artistIdsByTrack.get(trackId) ?? [];
    for (const artistId of artistIds) {
      countByArtist.set(artistId, (countByArtist.get(artistId) ?? 0) + 1);
      // Spätere (also jüngere) Vorkommen überschreiben den Index einfach —
      // am Ende steht dort das jüngste Vorkommen.
      lastIndexByArtist.set(artistId, index);
    }
  });

  return Array.from(countByArtist.keys())
    .sort((a, b) => {
      const countDiff = (countByArtist.get(b) ?? 0) - (countByArtist.get(a) ?? 0);
      if (countDiff !== 0) return countDiff;
      return (lastIndexByArtist.get(b) ?? 0) - (lastIndexByArtist.get(a) ?? 0);
    })
    .slice(0, Math.max(0, topK));
}

/**
 * Führt mehrere Kandidatenlisten zusammen: Duplikate (gleiche Track-ID)
 * und ausgeschlossene IDs fallen weg. Reine Funktion.
 *
 * Reihenfolge der sources entscheidet bei Duplikaten, welcher Eintrag
 * gewinnt — hier unerheblich, da beide Quellen dieselben Track-Objekte
 * liefern würden.
 */
export function mergeCandidatePools(
  sources: Track[][],
  excludedTrackIds: Set<string>
): Track[] {
  const seen = new Set<string>();
  const result: Track[] = [];

  for (const list of sources) {
    for (const track of list) {
      if (!track?.id) continue;
      if (excludedTrackIds.has(track.id)) continue;
      if (seen.has(track.id)) continue;
      seen.add(track.id);
      result.push(track);
    }
  }

  return result;
}

/**
 * Baut die Suchanfrage für ein Genre.
 *
 * "Party Mix" ist kein echtes Genre, sondern die neutrale Option aus den
 * Party-Einstellungen — dafür eine generische Anfrage statt "Party Mix
 * hits" wörtlich zu suchen.
 */
function genreSearchQuery(genre: string): string {
  return genre.trim().toLowerCase() === "party mix" ? "party hits" : `${genre} hits`;
}

/**
 * Erzeugt den Kandidatenpool einer Party.
 *
 * I/O-Zusammenfassung (alles am Rand, keine Rechenlogik hier):
 *  1. Künstler-IDs der zuletzt gespielten Titel auflösen.
 *  2. Deren Top-Tracks holen (angesagte Künstler).
 *  3. Titel zu den Party-Genres suchen.
 *  4. Zusammenführen, bereits gespielte Titel sowie aktuelle Warteschlange
 *     und laufenden Song ausschließen.
 *
 * Einzelne fehlgeschlagene Anfragen (Netzwerk, einzelner Künstler) werfen
 * das Gesamtergebnis nicht um — sie tragen einfach nichts bei.
 */
export async function buildCandidatePool(
  manager: PartyManager,
  provider: MusicProvider,
  genres: PartyGenre[]
): Promise<Track[]> {
  const recent = manager.getRecentPlayedTracks(RECENT_ARTIST_WINDOW);
  const trackIds = recent.map((entry) => entry.trackId);

  const artistIdsByTrack =
    trackIds.length > 0 ? await fetchArtistIdsPerTrack(trackIds) : new Map<string, string[]>();
  const trendingArtistIds = pickTrendingArtistIds(trackIds, artistIdsByTrack);

  const [artistTrackLists, genreTrackLists] = await Promise.all([
    Promise.all(
      trendingArtistIds.map((artistId) =>
        provider.getArtistTopTracks(artistId).catch((error) => {
          console.warn(`[candidate-pool] Top-Tracks für Künstler ${artistId} fehlgeschlagen:`, error);
          return [] as Track[];
        })
      )
    ),
    Promise.all(
      genres.map((genre) =>
        provider.searchTracks(genreSearchQuery(genre), GENRE_SEARCH_LIMIT).catch((error) => {
          console.warn(`[candidate-pool] Genre-Suche für "${genre}" fehlgeschlagen:`, error);
          return [] as Track[];
        })
      )
    ),
  ]);

  const state = manager.getState();
  const excludedTrackIds = new Set<string>(manager.getPlayedTrackIds());
  for (const track of state.queue) excludedTrackIds.add(track.id);
  if (state.currentTrack?.id) excludedTrackIds.add(state.currentTrack.id);

  return mergeCandidatePools([...artistTrackLists, ...genreTrackLists], excludedTrackIds);
}
