// src/app/lib/party/partyTrend.test.ts
//
// Story F1: dauerhafte Fassung der Ad-hoc-Prüfungen aus Story C2.

import { describe, it, expect } from "vitest";
import {
  computePartyTrend,
  RECENT_TREND_WINDOW,
  MIN_TRACKS_FOR_TREND,
} from "./partyTrend";
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

describe("computePartyTrend", () => {
  it("liefert null bei weniger als MIN_TRACKS_FOR_TREND Titeln", () => {
    const entries = Array.from({ length: MIN_TRACKS_FOR_TREND - 1 }, (_, i) => ({
      features: features(),
      playedAt: NOW - i * 1000,
    }));
    expect(computePartyTrend(entries, NOW)).toBeNull();
  });

  it('erkennt einen Anstieg in Energie/Tanzbarkeit als "wird energischer"', () => {
    const older = Array.from({ length: 6 }, () => ({
      features: features({ energy: 0.2, danceability: 0.2 }),
      playedAt: NOW - 20_000,
    }));
    const recent = Array.from({ length: RECENT_TREND_WINDOW }, () => ({
      features: features({ energy: 0.9, danceability: 0.9 }),
      playedAt: NOW,
    }));
    const result = computePartyTrend([...older, ...recent], NOW);
    expect(result?.label).toBe("wird energischer");
    expect(result?.drift.energy).toBeGreaterThan(0.3);
    expect(result?.sampleSize).toBe(older.length + recent.length);
  });

  it('erkennt einen Abfall in valence als "wird melancholischer"', () => {
    const older = Array.from({ length: 6 }, () => ({ features: features({ valence: 0.9 }), playedAt: NOW - 20_000 }));
    const recent = Array.from({ length: RECENT_TREND_WINDOW }, () => ({ features: features({ valence: 0.1 }), playedAt: NOW }));
    expect(computePartyTrend([...older, ...recent], NOW)?.label).toBe("wird melancholischer");
  });

  it('erkennt einen Tempo-Anstieg als "wird schneller"', () => {
    const older = Array.from({ length: 6 }, () => ({ features: features({ tempo: 90 }), playedAt: NOW - 20_000 }));
    const recent = Array.from({ length: RECENT_TREND_WINDOW }, () => ({ features: features({ tempo: 180 }), playedAt: NOW }));
    expect(computePartyTrend([...older, ...recent], NOW)?.label).toBe("wird schneller");
  });

  it('liefert "bleibt stabil" bei minimaler Differenz', () => {
    const entries = Array.from({ length: MIN_TRACKS_FOR_TREND }, (_, i) => ({
      features: features({ energy: 0.5 + (i % 2 === 0 ? 0.01 : -0.01) }),
      playedAt: NOW - i * 1000,
    }));
    expect(computePartyTrend(entries, NOW)?.label).toBe("bleibt stabil");
  });

  it("schließt Titel ohne Merkmale aus", () => {
    const entries = [
      ...Array.from({ length: MIN_TRACKS_FOR_TREND }, (_, i) => ({ features: features(), playedAt: NOW - i * 1000 })),
      { features: null, playedAt: NOW },
      { features: undefined, playedAt: NOW },
    ];
    expect(computePartyTrend(entries, NOW)?.sampleSize).toBe(MIN_TRACKS_FOR_TREND);
  });

  it("liefert null für leere oder ungültige Eingabe, statt zu werfen", () => {
    expect(computePartyTrend([], NOW)).toBeNull();
    expect(computePartyTrend(null as any, NOW)).toBeNull();
  });
});
