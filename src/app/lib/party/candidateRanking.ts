// src/app/lib/party/candidateRanking.ts
//
// Rankt einen Kandidatenpool nach Ähnlichkeit zum Party-Profil (Story D2).
//
// Nutzt den Kandidatenpool aus Story D1 und das Party-Profil aus Story C1.
// Wie D1 wird diese Datei an keiner Stelle automatisch aufgerufen — sie
// stellt nur die Fähigkeit bereit. Einreihen (mit/ohne Bestätigung) ist
// Story D3/D4.
//
// Reine Rechenfunktionen (cosineSimilarity, rankCandidates), I/O
// (Merkmale holen) nur im Orchestrator rankCandidatePool am Rand.

import type { AudioFeatures, Track } from "../providers/types";
import { getAudioFeatureProvider } from "../providers/factory";
import { normalizeTempo, type PartyProfile, type PartyProfileVector } from "./partyProfile";

/** Wandelt gemessene/geschätzte Merkmale in denselben Vektor-Raum wie das Party-Profil um. */
function toVector(features: AudioFeatures): PartyProfileVector {
  return {
    tempo: normalizeTempo(features.tempo),
    energy: features.energy,
    danceability: features.danceability,
    valence: features.valence,
  };
}

const VECTOR_DIMENSIONS: (keyof PartyProfileVector)[] = [
  "tempo",
  "energy",
  "danceability",
  "valence",
];

/**
 * Kosinus-Ähnlichkeit zweier Vektoren: 1 = identische Richtung, 0 = keine
 * Übereinstimmung. Misst die Ausrichtung, nicht die absolute Größe —
 * passend hier, weil alle vier Dimensionen ohnehin auf 0..1 normiert sind.
 *
 * Ist einer der Vektoren komplett 0 (kein Merkmal ausgeprägt), gäbe es
 * keine sinnvolle Richtung zum Vergleichen — dann 0 statt NaN.
 */
export function cosineSimilarity(a: PartyProfileVector, b: PartyProfileVector): number {
  let dot = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (const dimension of VECTOR_DIMENSIONS) {
    dot += a[dimension] * b[dimension];
    magnitudeA += a[dimension] * a[dimension];
    magnitudeB += b[dimension] * b[dimension];
  }

  const denominator = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);
  if (denominator === 0) return 0;

  return dot / denominator;
}

/** Deutsche Kurzbezeichnung je Dimension, für die Erklärung am Kandidaten. */
const DIMENSION_LABELS: Record<keyof PartyProfileVector, string> = {
  tempo: "im Tempo",
  energy: "in der Energie",
  danceability: "in der Tanzbarkeit",
  valence: "in der Stimmung",
};

/**
 * Wählt die Dimension mit der geringsten Abweichung zum Profil und baut
 * daraus eine kurze, nachvollziehbare Erklärung — nicht die Ähnlichkeit
 * als Zahl, sondern "woran es liegt".
 */
function explainMatch(profile: PartyProfileVector, candidate: PartyProfileVector): string {
  let bestDimension = VECTOR_DIMENSIONS[0];
  let smallestDiff = Infinity;

  for (const dimension of VECTOR_DIMENSIONS) {
    const diff = Math.abs(profile[dimension] - candidate[dimension]);
    if (diff < smallestDiff) {
      smallestDiff = diff;
      bestDimension = dimension;
    }
  }

  return `Ähnlich ${DIMENSION_LABELS[bestDimension]}`;
}

export interface RankedCandidate {
  track: Track;
  /** -1..1, höher = ähnlicher zum Profil. */
  similarity: number;
  explanation: string;
}

/** Eingabe für rankCandidates: ein Kandidat mit (ggf. fehlenden) Merkmalen. */
export interface CandidateWithFeatures {
  track: Track;
  features: AudioFeatures | null | undefined;
}

/**
 * Rankt Kandidaten nach Kosinus-Ähnlichkeit zum Profil-Vektor.
 *
 * Kandidaten ohne bekannte Merkmale werden ausgeschlossen statt mit einem
 * geratenen Wert (z. B. 0) gerankt zu werden — das würde ihnen fälschlich
 * eine Ähnlichkeit vortäuschen.
 *
 * Deterministisch: bei exakt gleicher Ähnlichkeit entscheidet die
 * Track-ID (aufsteigend) über die Reihenfolge, damit derselbe Pool immer
 * dasselbe Ranking ergibt.
 */
export function rankCandidates(
  profileVector: PartyProfileVector,
  entries: CandidateWithFeatures[]
): RankedCandidate[] {
  if (!Array.isArray(entries)) return [];

  const usable = entries.filter(
    (entry): entry is { track: Track; features: AudioFeatures } =>
      !!entry && !!entry.track?.id && !!entry.features
  );

  const ranked = usable.map((entry) => {
    const candidateVector = toVector(entry.features);
    return {
      track: entry.track,
      similarity: cosineSimilarity(profileVector, candidateVector),
      explanation: explainMatch(profileVector, candidateVector),
    };
  });

  ranked.sort((a, b) => {
    const diff = b.similarity - a.similarity;
    if (diff !== 0) return diff;
    return a.track.id < b.track.id ? -1 : a.track.id > b.track.id ? 1 : 0;
  });

  return ranked;
}

/**
 * Holt zu den Kandidaten ihre Audio-Merkmale (bestehende Anbieter-Kette,
 * Story B1/B2) und rankt sie gegen das aktuelle Party-Profil.
 *
 * Ohne Profil (noch nicht genug Titel gespielt, siehe Story C1) gibt es
 * nichts zu ranken — leeres Ergebnis statt eines Fehlers.
 */
export async function rankCandidatePool(
  candidates: Track[],
  profile: PartyProfile | null
): Promise<RankedCandidate[]> {
  if (!profile || !Array.isArray(candidates) || candidates.length === 0) return [];

  const provider = getAudioFeatureProvider();
  const featuresByTrackId = await provider.getAudioFeatures(candidates.map((track) => track.id));

  const entries: CandidateWithFeatures[] = candidates.map((track) => ({
    track,
    features: featuresByTrackId.get(track.id),
  }));

  return rankCandidates(profile.vector, entries);
}
