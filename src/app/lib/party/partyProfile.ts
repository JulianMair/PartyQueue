// src/app/lib/party/partyProfile.ts
//
// Berechnet das zeitgewichtete Party-Profil aus gespielten Titeln (Story C1).
//
// Die Idee: nicht jeder gespielte Titel soll gleich stark zählen. Ein Titel
// von vor einer Stunde sagt wenig über die Stimmung *jetzt*. Deshalb fließen
// neuere Titel exponentiell stärker ein als ältere — ähnlich einem
// gleitenden Durchschnitt, der die Vergangenheit langsam "vergisst".
//
// Die Funktion ist rein: keine Datenbank, kein Netzwerk, kein Date.now()
// intern (der Zeitpunkt "jetzt" kommt als Parameter). Das Holen der
// Audio-Merkmale (Netzwerk, Zwischenspeicher) passiert am Rand im
// PartyManager, nicht hier.

import type { AudioFeatures } from "../providers/types";

/**
 * Mindestanzahl an Titeln mit bekannten Merkmalen, bevor ein Profil
 * berechnet wird.
 *
 * Mit nur ein oder zwei Titeln wäre das "Profil" nur eine Kopie dieser
 * einzelnen Titel und würde eine Aussagekraft vortäuschen, die nicht da
 * ist. Der Wert kommt aus der Algorithmus-Referenz des Features.
 */
export const MIN_TRACKS_FOR_PARTY_PROFILE = 5;

/**
 * Halbwertszeit der Gewichtung: nach dieser Zeit zählt ein Titel nur noch
 * halb so stark wie ein gerade gespielter.
 *
 * 15 Minuten entsprechen grob 3-4 Titeln — ein Genre-Wechsel auf der Party
 * schlägt sich also innerhalb weniger Titel im Profil nieder, statt von
 * der ganzen bisherigen Session ausgebremst zu werden.
 */
export const RECENCY_HALF_LIFE_MS = 15 * 60 * 1000;

/**
 * Obergrenze für die Umrechnung von Tempo (BPM) auf eine 0..1 Skala.
 *
 * AudioFeatures.tempo liegt laut Definition typisch zwischen 60 und 200.
 * 200 als Obergrenze normiert den Wert grob auf denselben Bereich wie
 * energy/danceability/valence, damit spätere Vergleiche (z. B. Ähnlichkeit)
 * nicht von der Einheit BPM verzerrt werden.
 */
const TEMPO_NORMALIZATION_MAX = 200;

/** Der Profil-Vektor selbst, jede Komponente auf 0..1 normiert. */
export interface PartyProfileVector {
  tempo: number;
  energy: number;
  danceability: number;
  valence: number;
}

/** Ergebnis einer Profilberechnung. */
export interface PartyProfile {
  vector: PartyProfileVector;
  /** Wie viele Titel mit bekannten Merkmalen eingeflossen sind. */
  sampleSize: number;
  /** Der "jetzt"-Zeitpunkt, mit dem gerechnet wurde. */
  computedAt: number;
}

/**
 * Ein gespielter Titel als Eingabe für die Profilberechnung.
 *
 * features ist absichtlich optional/nullbar: die Merkmals-Anbieterkette
 * (Story B1/B2) liefert für Titel ohne Ergebnis null zurück. Solche Titel
 * werden hier ausgeschlossen statt mit 0 zu rechnen — 0 wäre ein falscher,
 * erfundener Messwert.
 */
export interface PartyProfileInputEntry {
  features: AudioFeatures | null | undefined;
  playedAt: number;
}

/**
 * Rechnet Tempo in BPM auf eine 0..1 Skala um, robust gegen Unsinnswerte.
 * Exportiert, damit partyTrend.ts (Story C2) dieselbe Normierung verwendet
 * statt sie ein zweites Mal zu definieren.
 */
export function normalizeTempo(tempo: number): number {
  if (!Number.isFinite(tempo) || tempo <= 0) return 0;
  return Math.min(1, tempo / TEMPO_NORMALIZATION_MAX);
}

/**
 * Berechnet das zeitgewichtete Party-Profil.
 *
 * Ablauf:
 *  1. Nur Einträge mit tatsächlich vorhandenen Merkmalen und gültigem
 *     Zeitstempel werden berücksichtigt.
 *  2. Reichen davon nicht mindestens MIN_TRACKS_FOR_PARTY_PROFILE, gibt es
 *     kein Profil (null) statt eines aus zu wenigen Daten geratenen.
 *  3. Jeder Titel bekommt ein Gewicht nach seinem Alter (exponentieller
 *     Zerfall über RECENCY_HALF_LIFE_MS). Das Profil ist der gewichtete
 *     Mittelwert aller vier Merkmale.
 *
 * @param entries Gespielte Titel mit (ggf. fehlenden) Merkmalen.
 * @param now     Referenzzeitpunkt "jetzt" in ms seit 1970. Als Parameter
 *                statt Date.now(), damit die Funktion in Tests mit einem
 *                festen Wert ein vorhersagbares Ergebnis liefert.
 */
export function computePartyProfile(
  entries: PartyProfileInputEntry[],
  now: number = Date.now()
): PartyProfile | null {
  if (!Array.isArray(entries)) return null;

  const usable = entries.filter(
    (entry): entry is { features: AudioFeatures; playedAt: number } =>
      !!entry && !!entry.features && Number.isFinite(entry.playedAt)
  );

  if (usable.length < MIN_TRACKS_FOR_PARTY_PROFILE) return null;

  let weightSum = 0;
  let tempoSum = 0;
  let energySum = 0;
  let danceabilitySum = 0;
  let valenceSum = 0;

  for (const entry of usable) {
    // Zukünftige Zeitstempel (Uhrenabweichung) nicht negativ altern lassen —
    // sonst würde ein solcher Titel stärker zählen als ein aktueller.
    const ageMs = Math.max(0, now - entry.playedAt);
    const weight = Math.exp((-Math.LN2 * ageMs) / RECENCY_HALF_LIFE_MS);

    weightSum += weight;
    tempoSum += weight * normalizeTempo(entry.features.tempo);
    energySum += weight * entry.features.energy;
    danceabilitySum += weight * entry.features.danceability;
    valenceSum += weight * entry.features.valence;
  }

  // Kann bei mindestens einem Eintrag rechnerisch nicht 0 werden (exp ist
  // immer > 0), aber lieber sauber abgesichert als eine Division durch 0.
  if (weightSum <= 0) return null;

  return {
    vector: {
      tempo: tempoSum / weightSum,
      energy: energySum / weightSum,
      danceability: danceabilitySum / weightSum,
      valence: valenceSum / weightSum,
    },
    sampleSize: usable.length,
    computedAt: now,
  };
}
