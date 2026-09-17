// src/app/lib/party/candidatePool.test.ts
//
// Story F1: dauerhafte Fassung der Ad-hoc-Prüfungen aus Story D1.
// Getestet werden nur die reinen Funktionen — buildCandidatePool selbst
// braucht einen echten MusicProvider (Netzwerk) und bleibt außen vor.

import { describe, it, expect } from "vitest";
import { pickTrendingArtistIds, mergeCandidatePools, TOP_TRENDING_ARTISTS } from "./candidatePool";
import type { Track } from "../providers/types";

const track = (id: string): Track => ({ id, name: id, artist: "X", uri: `spotify:track:${id}` });

describe("pickTrendingArtistIds", () => {
  it("wählt den häufigeren Künstler vor dem selteneren", () => {
    const trackIds = ["t1", "t2", "t3", "t4"];
    const artistIdsByTrack = new Map([
      ["t1", ["A"]],
      ["t2", ["B"]],
      ["t3", ["A"]],
      ["t4", ["A"]],
    ]);
    const result = pickTrendingArtistIds(trackIds, artistIdsByTrack, 2);
    expect(result).toEqual(["A", "B"]);
  });

  it("entscheidet Gleichstand nach dem jüngeren Vorkommen", () => {
    const trackIds = ["t1", "t2"]; // t1 älter, t2 jünger
    const artistIdsByTrack = new Map([
      ["t1", ["OLD"]],
      ["t2", ["NEW"]],
    ]);
    expect(pickTrendingArtistIds(trackIds, artistIdsByTrack, 2)).toEqual(["NEW", "OLD"]);
  });

  it("begrenzt korrekt auf topK", () => {
    const trackIds = ["t1", "t2", "t3"];
    const artistIdsByTrack = new Map([
      ["t1", ["A"]],
      ["t2", ["B"]],
      ["t3", ["C"]],
    ]);
    expect(pickTrendingArtistIds(trackIds, artistIdsByTrack, 2)).toHaveLength(2);
  });

  it("zählt einen Titel mit mehreren Künstlern für jeden von ihnen", () => {
    const result = pickTrendingArtistIds(["t1"], new Map([["t1", ["A", "B"]]]), 5);
    expect(result).toEqual(expect.arrayContaining(["A", "B"]));
  });

  it("liefert [] bei leerer Eingabe", () => {
    expect(pickTrendingArtistIds([], new Map(), 5)).toEqual([]);
  });

  it("nutzt TOP_TRENDING_ARTISTS als Standard für topK", () => {
    const trackIds = Array.from({ length: 10 }, (_, i) => `t${i}`);
    const artistIdsByTrack = new Map(trackIds.map((id, i) => [id, [`artist${i}`]]));
    expect(pickTrendingArtistIds(trackIds, artistIdsByTrack)).toHaveLength(TOP_TRENDING_ARTISTS);
  });
});

describe("mergeCandidatePools", () => {
  it("entfernt Duplikate über mehrere Quellen hinweg", () => {
    const a = [track("1"), track("2")];
    const b = [track("2"), track("3")];
    expect(mergeCandidatePools([a, b], new Set())).toHaveLength(3);
  });

  it("schließt ausgeschlossene IDs aus", () => {
    const a = [track("1"), track("2"), track("3")];
    const result = mergeCandidatePools([a], new Set(["2"]));
    expect(result.map((t) => t.id)).toEqual(["1", "3"]);
  });

  it("überspringt Einträge ohne id statt zu crashen", () => {
    const a = [track("1"), { name: "kaputt" } as unknown as Track];
    expect(mergeCandidatePools([a], new Set())).toHaveLength(1);
  });

  it("liefert [] für leere Quellen", () => {
    expect(mergeCandidatePools([], new Set())).toEqual([]);
  });
});
