// src/app/lib/party/partyProfile.test.ts
//
// Story F1: dauerhafte Fassung der Ad-hoc-Prüfungen aus Story C1.

import { describe, it, expect } from "vitest";
import {
  computePartyProfile,
  MIN_TRACKS_FOR_PARTY_PROFILE,
  RECENCY_HALF_LIFE_MS,
} from "./partyProfile";
import type { AudioFeatures } from "../providers/types";

const NOW = 1_000_000_000;

const features = (overrides: Partial<AudioFeatures> = {}): AudioFeatures => ({
  tempo: 120,
  energy: 0.5,
  danceability: 0.5,
  valence: 0.5,
  source: "measured",
  ...overrides,
});

describe("computePartyProfile", () => {
  it("liefert null bei weniger als MIN_TRACKS_FOR_PARTY_PROFILE Titeln", () => {
    const entries = Array.from({ length: MIN_TRACKS_FOR_PARTY_PROFILE - 1 }, (_, i) => ({
      features: features(),
      playedAt: NOW - i * 1000,
    }));
    expect(computePartyProfile(entries, NOW)).toBeNull();
  });

  it("schließt Titel ohne Merkmale aus, statt mit 0 zu rechnen", () => {
    const withNulls = [
      ...Array.from({ length: 5 }, (_, i) => ({
        features: features({ energy: 0.8, danceability: 0.8, valence: 0.8 }),
        playedAt: NOW - i * 1000,
      })),
      { features: null, playedAt: NOW },
      { features: undefined, playedAt: NOW },
    ];
    const result = computePartyProfile(withNulls, NOW);
    expect(result?.sampleSize).toBe(5);
    expect(result?.vector.energy).toBeCloseTo(0.8, 2);
  });

  it("gewichtet neuere Titel exponentiell stärker als sehr alte", () => {
    const old = {
      features: features({ tempo: 80, energy: 0.1, danceability: 0.1, valence: 0.1 }),
      playedAt: NOW - 10 * RECENCY_HALF_LIFE_MS,
    };
    const recent = Array.from({ length: 5 }, (_, i) => ({
      features: features({ tempo: 160, energy: 0.9, danceability: 0.9, valence: 0.9 }),
      playedAt: NOW - i * 100,
    }));
    const result = computePartyProfile([old, ...recent], NOW);
    expect(result?.vector.energy).toBeGreaterThan(0.85);
  });

  it("gewichtet nach der Halbwertszeit korrekt", () => {
    const fresh = Array.from({ length: 4 }, () => ({
      features: features({ energy: 1, danceability: 1, valence: 1 }),
      playedAt: NOW,
    }));
    const halfOld = {
      features: features({ energy: 0, danceability: 0, valence: 0 }),
      playedAt: NOW - RECENCY_HALF_LIFE_MS,
    };
    const result = computePartyProfile([...fresh, halfOld], NOW);
    // Gewichte: 4×1 + 1×0.5 = 4.5; Summe energy = 4×1 + 0.5×0 = 4 → 4/4.5
    expect(result?.vector.energy).toBeCloseTo(4 / 4.5, 3);
  });

  it("kappt Tempo auf 1 statt einen Wert über 1 zu liefern", () => {
    const entries = Array.from({ length: 5 }, () => ({
      features: features({ tempo: 400 }),
      playedAt: NOW,
    }));
    expect(computePartyProfile(entries, NOW)?.vector.tempo).toBe(1);
  });

  it("bricht bei einem zukünftigen Zeitstempel nicht ab", () => {
    const entries = Array.from({ length: 5 }, () => ({
      features: features(),
      playedAt: NOW + 999_999,
    }));
    expect(computePartyProfile(entries, NOW)).not.toBeNull();
  });

  it("liefert null für leere oder ungültige Eingabe, statt zu werfen", () => {
    expect(computePartyProfile([], NOW)).toBeNull();
    expect(computePartyProfile(null as any, NOW)).toBeNull();
  });
});
