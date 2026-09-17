// src/app/lib/party/settings.test.ts
//
// Story F1: Absicherung der bestehenden sanitizePartySettings-Logik
// (u. a. genutzt von den Stories D3/D4).

import { describe, it, expect } from "vitest";
import { sanitizePartySettings, DEFAULT_PARTY_SETTINGS } from "./settings";

describe("sanitizePartySettings", () => {
  it("liefert die Defaults für fehlende oder ungültige Eingabe", () => {
    expect(sanitizePartySettings(undefined)).toEqual(DEFAULT_PARTY_SETTINGS);
    expect(sanitizePartySettings(null)).toEqual(DEFAULT_PARTY_SETTINGS);
    expect(sanitizePartySettings("kaputt")).toEqual(DEFAULT_PARTY_SETTINGS);
  });

  it("übernimmt gültige Werte unverändert", () => {
    const result = sanitizePartySettings({
      autoFillEnabled: true,
      autoFillMode: "suggest",
      targetQueueSize: 30,
      allowExplicit: true,
      fadeSeconds: 5,
      transitionProfile: "aggressive",
      suggestionsEnabled: false,
      suggestionThreshold: 10,
      showNowPlaying: false,
    });
    expect(result).toEqual({
      autoFillEnabled: true,
      autoFillMode: "suggest",
      targetQueueSize: 30,
      allowExplicit: true,
      fadeSeconds: 5,
      transitionProfile: "aggressive",
      suggestionsEnabled: false,
      suggestionThreshold: 10,
      showNowPlaying: false,
    });
  });

  it("fällt bei ungültigem autoFillMode auf 'auto' zurück", () => {
    expect(sanitizePartySettings({ autoFillMode: "not-a-mode" }).autoFillMode).toBe("auto");
  });

  it("fällt bei ungültigem transitionProfile auf 'balanced' zurück", () => {
    expect(sanitizePartySettings({ transitionProfile: "warp-speed" }).transitionProfile).toBe("balanced");
  });

  it("kappt targetQueueSize auf den Bereich 5..200", () => {
    expect(sanitizePartySettings({ targetQueueSize: 1 }).targetQueueSize).toBe(5);
    expect(sanitizePartySettings({ targetQueueSize: 999 }).targetQueueSize).toBe(200);
    expect(sanitizePartySettings({ targetQueueSize: "abc" }).targetQueueSize).toBe(20);
  });

  it("kappt fadeSeconds auf den Bereich 0..12", () => {
    expect(sanitizePartySettings({ fadeSeconds: -5 }).fadeSeconds).toBe(0);
    expect(sanitizePartySettings({ fadeSeconds: 99 }).fadeSeconds).toBe(12);
  });

  it("kappt suggestionThreshold auf den Bereich 1..20", () => {
    expect(sanitizePartySettings({ suggestionThreshold: 0 }).suggestionThreshold).toBe(1);
    expect(sanitizePartySettings({ suggestionThreshold: 50 }).suggestionThreshold).toBe(20);
  });

  it("behält bei fehlendem Feld das bisherige Sichtbarkeits-Verhalten (showNowPlaying/suggestionsEnabled)", () => {
    const result = sanitizePartySettings({});
    expect(result.showNowPlaying).toBe(true);
    expect(result.suggestionsEnabled).toBe(true);
  });
});
