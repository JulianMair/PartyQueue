// src/app/lib/party/partyTrend.ts
//
// Leitet aus den gespielten Titeln ab, wohin sich die Stimmung bewegt
// (Story C2).
//
// Anders als das Party-Profil (Story C1, zeitgewichteter Durchschnitt über
// die ganze bisherige Session) vergleicht der Trend zwei Momentaufnahmen:
// den Durchschnitt der zuletzt gespielten Titel gegen den Durchschnitt der
// gesamten bisherigen Session. Die Differenz zeigt die Richtung ("wird
// schneller", "wird ruhiger", ...), nicht nur den aktuellen Zustand.
//
// Reine Funktion, kein Date.now() intern, kein Netzwerk — wie partyProfile.ts.

import type { AudioFeatures } from "../providers/types";
import { normalizeTempo, type PartyProfileVector } from "./partyProfile";

/**
 * Wie viele der zuletzt gespielten Titel als "gerade eben" gelten.
 *
 * 6 Titel entsprechen grob 20-25 Minuten Musik — lang genug, um keinen
 * Ausreißer überzubewerten, kurz genug, um einen echten Stimmungswechsel
 * zeitnah zu zeigen.
 */
export const RECENT_TREND_WINDOW = 6;

/**
 * Mindestanzahl an Titeln mit bekannten Merkmalen, bevor ein Trend
 * berechnet wird.
 *
 * Muss größer sein als RECENT_TREND_WINDOW: sonst wäre der "bisherige
 * Durchschnitt" identisch mit dem "gerade eben"-Fenster und der Trend
 * immer 0. Die vier zusätzlichen Titel sind die Mindest-Basis, gegen die
 * verglichen wird.
 */
export const MIN_TRACKS_FOR_TREND = RECENT_TREND_WINDOW + 4;

/**
 * Ab welcher Differenz (auf der 0..1-Skala) eine Dimension als spürbar
 * verändert gilt und ins Label einfließt. Kleinere Schwankungen gelten als
 * Rauschen und werden als "bleibt stabil" ausgewiesen.
 */
const DRIFT_LABEL_THRESHOLD = 0.08;

/** Eingabe wie bei computePartyProfile: Titel mit (ggf. fehlenden) Merkmalen. */
export interface PartyTrendInputEntry {
  features: AudioFeatures | null | undefined;
  playedAt: number;
}

export type TrendLabel =
  | "wird schneller"
  | "wird langsamer"
  | "wird energischer"
  | "wird ruhiger"
  | "wird fröhlicher"
  | "wird melancholischer"
  | "bleibt stabil";

export interface PartyTrend {
  /** Durchschnitt der gesamten bisherigen Session. */
  overall: PartyProfileVector;
  /** Durchschnitt der letzten RECENT_TREND_WINDOW Titel. */
  recent: PartyProfileVector;
  /** recent minus overall, je Dimension — positiv heißt "mehr davon". */
  drift: PartyProfileVector;
  /** Kurzes, menschenlesbares Label für die auffälligste Veränderung. */
  label: TrendLabel;
  /** Wie viele Titel insgesamt eingeflossen sind. */
  sampleSize: number;
  computedAt: number;
}

/** Ungewichteter Mittelwert über eine Liste von Merkmalen. */
function averageVector(featuresList: AudioFeatures[]): PartyProfileVector {
  const count = featuresList.length;
  const sum = featuresList.reduce(
    (acc, f) => ({
      tempo: acc.tempo + normalizeTempo(f.tempo),
      energy: acc.energy + f.energy,
      danceability: acc.danceability + f.danceability,
      valence: acc.valence + f.valence,
    }),
    { tempo: 0, energy: 0, danceability: 0, valence: 0 }
  );
  return {
    tempo: sum.tempo / count,
    energy: sum.energy / count,
    danceability: sum.danceability / count,
    valence: sum.valence / count,
  };
}

/**
 * Bestimmt das Label aus dem Drift-Vektor.
 *
 * Gewinnt die Dimension mit dem größten Ausschlag — aber nur, wenn der
 * über der Schwelle liegt. Sonst gilt die Stimmung als unverändert.
 * energy und danceability teilen sich ein Label, weil beide dasselbe
 * beschreiben: wie sehr ein Titel treibt.
 */
function labelFromDrift(drift: PartyProfileVector): TrendLabel {
  const candidates: { dimension: "tempo" | "energy" | "danceability" | "valence"; value: number }[] = [
    { dimension: "tempo", value: drift.tempo },
    { dimension: "energy", value: drift.energy },
    { dimension: "danceability", value: drift.danceability },
    { dimension: "valence", value: drift.valence },
  ];

  const dominant = candidates.reduce((max, current) =>
    Math.abs(current.value) > Math.abs(max.value) ? current : max
  );

  if (Math.abs(dominant.value) < DRIFT_LABEL_THRESHOLD) return "bleibt stabil";

  const rising = dominant.value > 0;
  switch (dominant.dimension) {
    case "tempo":
      return rising ? "wird schneller" : "wird langsamer";
    case "energy":
    case "danceability":
      return rising ? "wird energischer" : "wird ruhiger";
    case "valence":
      return rising ? "wird fröhlicher" : "wird melancholischer";
  }
}

/**
 * Berechnet den aktuellen Stimmungstrend.
 *
 * @param entries Gespielte Titel mit (ggf. fehlenden) Merkmalen, ältester
 *                zuerst — dieselbe Reihenfolge wie playedTracks.
 * @param now     Referenzzeitpunkt, siehe computePartyProfile.
 */
export function computePartyTrend(
  entries: PartyTrendInputEntry[],
  now: number = Date.now()
): PartyTrend | null {
  if (!Array.isArray(entries)) return null;

  const usable = entries.filter(
    (entry): entry is { features: AudioFeatures; playedAt: number } =>
      !!entry && !!entry.features && Number.isFinite(entry.playedAt)
  );

  if (usable.length < MIN_TRACKS_FOR_TREND) return null;

  const overallFeatures = usable.map((entry) => entry.features);
  const recentFeatures = usable.slice(-RECENT_TREND_WINDOW).map((entry) => entry.features);

  const overall = averageVector(overallFeatures);
  const recent = averageVector(recentFeatures);
  const drift: PartyProfileVector = {
    tempo: recent.tempo - overall.tempo,
    energy: recent.energy - overall.energy,
    danceability: recent.danceability - overall.danceability,
    valence: recent.valence - overall.valence,
  };

  return {
    overall,
    recent,
    drift,
    label: labelFromDrift(drift),
    sampleSize: usable.length,
    computedAt: now,
  };
}
