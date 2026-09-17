// src/app/lib/party/autoFillSelection.test.ts
//
// Story F1: dauerhafte Fassung der Ad-hoc-Prüfungen aus Story D3.

import { describe, it, expect } from "vitest";
import { selectAutoFillTracks } from "./autoFillSelection";
import type { RankedCandidate } from "./candidateRanking";

const track = (id: string, overrides: Partial<{ explicit: boolean }> = {}) => ({
  id,
  name: id,
  artist: "X",
  uri: `spotify:track:${id}`,
  explicit: false,
  ...overrides,
});

const ranked = (id: string): RankedCandidate => ({
  track: track(id),
  similarity: 0,
  explanation: "x",
});

describe("selectAutoFillTracks", () => {
  it("nutzt ohne Ranking die Reihenfolge aus dem rohen Pool", () => {
    const candidates = [track("a"), track("b"), track("c")];
    const result = selectAutoFillTracks(candidates, null, 2, new Set(), true);
    expect(result.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("nutzt mit Ranking die Reihenfolge aus dem Ranking, nicht aus dem Pool", () => {
    const candidates = [track("a"), track("b"), track("c")];
    const rankedList = [ranked("c"), ranked("a"), ranked("b")];
    const result = selectAutoFillTracks(candidates, rankedList, 2, new Set(), true);
    expect(result.map((t) => t.id)).toEqual(["c", "a"]);
  });

  it("schließt Titel in excludeTrackIds aus", () => {
    const candidates = [track("a"), track("b"), track("c")];
    const result = selectAutoFillTracks(candidates, null, 5, new Set(["b"]), true);
    expect(result.map((t) => t.id)).toEqual(["a", "c"]);
  });

  it("filtert explizite Titel, wenn allowExplicit=false", () => {
    const candidates = [track("a"), track("b", { explicit: true }), track("c")];
    const result = selectAutoFillTracks(candidates, null, 5, new Set(), false);
    expect(result.map((t) => t.id)).toEqual(["a", "c"]);
  });

  it("lässt explizite Titel durch, wenn allowExplicit=true", () => {
    const result = selectAutoFillTracks([track("a", { explicit: true })], null, 5, new Set(), true);
    expect(result).toHaveLength(1);
  });

  it("begrenzt auf desiredCount", () => {
    const candidates = Array.from({ length: 10 }, (_, i) => track(`t${i}`));
    expect(selectAutoFillTracks(candidates, null, 3, new Set(), true)).toHaveLength(3);
  });

  it("liefert [] bei desiredCount <= 0", () => {
    expect(selectAutoFillTracks([track("a")], null, 0, new Set(), true)).toEqual([]);
  });

  it("überspringt Einträge ohne id/uri statt zu crashen", () => {
    const candidates = [{ name: "kaputt" } as any, track("a")];
    expect(selectAutoFillTracks(candidates, null, 5, new Set(), true)).toEqual([track("a")]);
  });

  it("liefert [] für einen leeren Pool", () => {
    expect(selectAutoFillTracks([], null, 5, new Set(), true)).toEqual([]);
  });
});
