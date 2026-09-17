// src/app/lib/party/playedHistory.test.ts
//
// Story F1: dauerhafte Fassung der Ad-hoc-Prüfungen aus Story A1/A2.

import { describe, it, expect } from "vitest";
import {
  makePlayedEntry,
  appendPlayedEntry,
  takeRecentPlayed,
  sanitizePlayedHistory,
  PLAYED_HISTORY_MAX,
  type PlayedTrackEntry,
} from "./playedHistory";

const track = (id: string) => ({ id, name: `Titel ${id}`, artist: "Künstler" });

describe("makePlayedEntry", () => {
  it("übernimmt Titel-Daten und den übergebenen Zeitpunkt", () => {
    const entry = makePlayedEntry(track("t1"), 1000);
    expect(entry).toEqual({ trackId: "t1", name: "Titel t1", artist: "Künstler", playedAt: 1000 });
  });
});

describe("appendPlayedEntry", () => {
  it("hängt hinten an und verändert die übergebene Liste nicht", () => {
    const history: PlayedTrackEntry[] = [makePlayedEntry(track("a"), 0)];
    const next = appendPlayedEntry(history, makePlayedEntry(track("b"), 1000));
    expect(history).toHaveLength(1);
    expect(next.map((e) => e.trackId)).toEqual(["a", "b"]);
  });

  it("verwirft Doppelmeldung desselben Titels innerhalb von 10s", () => {
    const history: PlayedTrackEntry[] = [makePlayedEntry(track("a"), 0)];
    const next = appendPlayedEntry(history, makePlayedEntry(track("a"), 5000));
    expect(next).toHaveLength(1);
  });

  it("akzeptiert echtes erneutes Abspielen nach mehr als 10s", () => {
    const history: PlayedTrackEntry[] = [makePlayedEntry(track("a"), 0)];
    const next = appendPlayedEntry(history, makePlayedEntry(track("a"), 10001));
    expect(next).toHaveLength(2);
  });

  it("begrenzt auf PLAYED_HISTORY_MAX Einträge, älteste fallen weg", () => {
    let history: PlayedTrackEntry[] = [];
    for (let i = 0; i < PLAYED_HISTORY_MAX + 5; i++) {
      history = appendPlayedEntry(history, makePlayedEntry(track(`t${i}`), i * 20_000));
    }
    expect(history).toHaveLength(PLAYED_HISTORY_MAX);
    expect(history[0].trackId).toBe("t5");
    expect(history.at(-1)?.trackId).toBe(`t${PLAYED_HISTORY_MAX + 4}`);
  });
});

describe("takeRecentPlayed", () => {
  const history: PlayedTrackEntry[] = [
    makePlayedEntry(track("a"), 0),
    makePlayedEntry(track("b"), 1),
    makePlayedEntry(track("c"), 2),
  ];

  it("gibt die letzten n Einträge chronologisch zurück", () => {
    expect(takeRecentPlayed(history, 2).map((e) => e.trackId)).toEqual(["b", "c"]);
  });

  it("liefert alles, wenn n größer als die Historie ist", () => {
    expect(takeRecentPlayed(history, 99)).toHaveLength(3);
  });

  it("liefert [] bei n <= 0, NaN oder ungültiger Historie", () => {
    expect(takeRecentPlayed(history, 0)).toEqual([]);
    expect(takeRecentPlayed(history, -1)).toEqual([]);
    expect(takeRecentPlayed(history, NaN)).toEqual([]);
    expect(takeRecentPlayed(null as unknown as PlayedTrackEntry[], 2)).toEqual([]);
  });

  it("gibt eine Kopie zurück, kein Alias auf die Originalliste", () => {
    const result = takeRecentPlayed(history, 2);
    result.push(makePlayedEntry(track("x"), 99));
    expect(history).toHaveLength(3);
  });
});

describe("sanitizePlayedHistory", () => {
  it("übernimmt vollständige, gültige Einträge", () => {
    const input = [{ trackId: "a", name: "N", artist: "A", playedAt: 123 }];
    expect(sanitizePlayedHistory(input)).toEqual(input);
  });

  it("überspringt Einträge mit fehlenden oder falsch typisierten Feldern", () => {
    const input = [
      { trackId: "a", name: "N", artist: "A", playedAt: 123 },
      { trackId: "b", name: "N" }, // artist/playedAt fehlen
      { trackId: 5, name: "N", artist: "A", playedAt: 123 }, // trackId falscher Typ
      null,
      "kaputt",
    ];
    const result = sanitizePlayedHistory(input);
    expect(result).toHaveLength(1);
    expect(result[0].trackId).toBe("a");
  });

  it("liefert [] für Nicht-Arrays statt zu werfen", () => {
    expect(sanitizePlayedHistory(undefined)).toEqual([]);
    expect(sanitizePlayedHistory({})).toEqual([]);
  });

  it("kappt auf PLAYED_HISTORY_MAX, behält die neuesten", () => {
    const input = Array.from({ length: PLAYED_HISTORY_MAX + 3 }, (_, i) => ({
      trackId: `t${i}`,
      name: "N",
      artist: "A",
      playedAt: i,
    }));
    const result = sanitizePlayedHistory(input);
    expect(result).toHaveLength(PLAYED_HISTORY_MAX);
    expect(result[0].trackId).toBe("t3");
  });
});
