// src/app/lib/party/candidateRanking.test.ts
//
// Story F1: dauerhafte Fassung der Ad-hoc-Prüfungen aus Story D2.
// rankCandidatePool selbst braucht den echten Merkmals-Anbieter
// (Netzwerk) und bleibt außen vor.

import { describe, it, expect } from "vitest";
import { cosineSimilarity, rankCandidates } from "./candidateRanking";
import type { AudioFeatures, Track } from "../providers/types";
import type { PartyProfileVector } from "./partyProfile";

const track = (id: string): Track => ({ id, name: id, artist: "X", uri: `spotify:track:${id}` });
const features = (overrides: Partial<AudioFeatures> = {}): AudioFeatures => ({
  tempo: 120,
  energy: 0.5,
  danceability: 0.5,
  valence: 0.5,
  source: "measured",
  ...overrides,
});

describe("cosineSimilarity", () => {
  it("liefert ~1 für identische Vektoren", () => {
    const v: PartyProfileVector = { tempo: 0.6, energy: 0.7, danceability: 0.5, valence: 0.4 };
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 9);
  });

  it("liefert 0 statt NaN, wenn ein Vektor komplett 0 ist", () => {
    const zero: PartyProfileVector = { tempo: 0, energy: 0, danceability: 0, valence: 0 };
    const other: PartyProfileVector = { tempo: 0.5, energy: 0.5, danceability: 0.5, valence: 0.5 };
    expect(cosineSimilarity(zero, other)).toBe(0);
  });
});

describe("rankCandidates", () => {
  it("sortiert den ähnlicheren Kandidaten nach vorne", () => {
    const profileVector: PartyProfileVector = { tempo: 0.6, energy: 0.8, danceability: 0.8, valence: 0.6 };
    const entries = [
      { track: track("far"), features: features({ tempo: 60, energy: 0.05, danceability: 0.05, valence: 0.05 }) },
      { track: track("close"), features: features({ tempo: 120, energy: 0.78, danceability: 0.8, valence: 0.6 }) },
    ];
    const result = rankCandidates(profileVector, entries);
    expect(result[0].track.id).toBe("close");
    expect(result.every((r) => typeof r.explanation === "string" && r.explanation.length > 0)).toBe(true);
  });

  it("schließt Kandidaten ohne bekannte Merkmale aus", () => {
    const profileVector: PartyProfileVector = { tempo: 0.6, energy: 0.5, danceability: 0.5, valence: 0.5 };
    const entries = [
      { track: track("known"), features: features() },
      { track: track("unknown"), features: null },
      { track: track("undef"), features: undefined },
    ];
    const result = rankCandidates(profileVector, entries);
    expect(result.map((r) => r.track.id)).toEqual(["known"]);
  });

  it("ist deterministisch: bei Gleichstand entscheidet die Track-ID", () => {
    const profileVector: PartyProfileVector = { tempo: 0.5, energy: 0.5, danceability: 0.5, valence: 0.5 };
    const sameFeatures = features({ tempo: 100, energy: 0.5, danceability: 0.5, valence: 0.5 });
    const entries = [
      { track: track("b"), features: sameFeatures },
      { track: track("a"), features: sameFeatures },
    ];
    expect(rankCandidates(profileVector, entries).map((r) => r.track.id)).toEqual(["a", "b"]);
  });

  it("nennt in der Erklärung die Dimension mit der geringsten Abweichung", () => {
    const profileVector: PartyProfileVector = { tempo: 0.6, energy: 0.9, danceability: 0.9, valence: 0.9 };
    const entries = [
      { track: track("t1"), features: features({ tempo: 120, energy: 0.1, danceability: 0.1, valence: 0.1 }) },
    ];
    expect(rankCandidates(profileVector, entries)[0].explanation).toContain("Tempo");
  });

  it("liefert [] für leere Eingabe", () => {
    expect(rankCandidates({ tempo: 0.5, energy: 0.5, danceability: 0.5, valence: 0.5 }, [])).toEqual([]);
  });
});
