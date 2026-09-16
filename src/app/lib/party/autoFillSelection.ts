// src/app/lib/party/autoFillSelection.ts
//
// Entscheidet, welche Kandidaten tatsächlich automatisch eingereiht
// werden (Story D3).
//
// Die eigentliche Beschaffung (Kandidatenpool aus Story D1, Ranking aus
// Story D2) ist I/O und lebt in PartyRegistry. Diese Funktion trifft nur
// die Auswahl-Entscheidung auf bereits vorliegenden Daten — rein,
// testbar, kein Netzwerk.

import type { Track } from "../providers/types";
import type { RankedCandidate } from "./candidateRanking";

/**
 * Wählt aus einem Kandidatenpool die Titel aus, die automatisch
 * eingereiht werden.
 *
 * @param candidates       Der rohe Kandidatenpool (Story D1), Reihenfolge:
 *                          Top-Tracks angesagter Künstler, dann Genre-Suche.
 * @param ranked            Ranking-Ergebnis (Story D2), oder null, wenn noch
 *                          kein Party-Profil existiert (zu junge Party,
 *                          siehe Story C1). Ist es vorhanden, bestimmt es
 *                          die Reihenfolge statt candidates — sonst bliebe
 *                          eine frische Party ohne jede automatische
 *                          Auffüllung, bis 5 Titel gelaufen sind.
 * @param desiredCount      Wie viele Titel maximal ausgewählt werden sollen.
 * @param excludeTrackIds   Zusätzlich auszuschließende IDs — hier die
 *                          zuletzt bereits automatisch eingereihten Titel
 *                          (recentAutoFillTrackIds in PartyRegistry), damit
 *                          nicht derselbe Titel Zyklus für Zyklus wieder
 *                          vorgeschlagen wird. Bereits gespielte Titel,
 *                          aktuelle Queue und laufender Song sind schon im
 *                          Kandidatenpool selbst ausgeschlossen (Story D1).
 * @param allowExplicit     Party-Einstellung: explizite Titel zulassen?
 */
export function selectAutoFillTracks(
  candidates: Track[],
  ranked: RankedCandidate[] | null,
  desiredCount: number,
  excludeTrackIds: Set<string>,
  allowExplicit: boolean
): Track[] {
  if (!Array.isArray(candidates) || desiredCount <= 0) return [];

  const orderedTracks = ranked ? ranked.map((entry) => entry.track) : candidates;

  const selected: Track[] = [];
  for (const track of orderedTracks) {
    if (!track?.id || !track?.uri) continue;
    if (excludeTrackIds.has(track.id)) continue;
    if (!allowExplicit && track.explicit) continue;

    selected.push(track);
    if (selected.length >= desiredCount) break;
  }

  return selected;
}
