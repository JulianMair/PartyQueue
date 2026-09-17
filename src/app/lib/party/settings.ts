export const TRANSITION_PROFILE_OPTIONS = ["smooth", "balanced", "aggressive"] as const;
export type TransitionProfile = (typeof TRANSITION_PROFILE_OPTIONS)[number];

/**
 * Wie automatisch aufgefüllte Titel behandelt werden (Story D4).
 *
 * "auto"    — Titel werden direkt in die Queue eingereiht (Story D3, bisheriges Verhalten).
 * "suggest" — Titel landen erst als Vorschlag (PartyManager.pendingRecommendations)
 *             und müssen vom Gastgeber einzeln bestätigt werden, bevor sie in die
 *             Queue kommen.
 */
export const AUTO_FILL_MODE_OPTIONS = ["auto", "suggest"] as const;
export type AutoFillMode = (typeof AUTO_FILL_MODE_OPTIONS)[number];

export interface PartySettings {
  autoFillEnabled: boolean;
  autoFillMode: AutoFillMode;
  targetQueueSize: number;
  allowExplicit: boolean;
  fadeSeconds: number;
  transitionProfile: TransitionProfile;
  suggestionsEnabled: boolean;
  suggestionThreshold: number;
  /** Zeigt den aktuell laufenden Song als "Live"-Leiste auf der Voting-Seite. */
  showNowPlaying: boolean;
}

export const DEFAULT_PARTY_SETTINGS: PartySettings = {
  autoFillEnabled: false,
  autoFillMode: "auto",
  targetQueueSize: 20,
  allowExplicit: false,
  fadeSeconds: 0,
  transitionProfile: "balanced",
  suggestionsEnabled: true,
  suggestionThreshold: 3,
  showNowPlaying: true,
};

export function sanitizePartySettings(input: unknown): PartySettings {
  const source = (input && typeof input === "object" ? input : {}) as Partial<PartySettings>;

  return {
    autoFillEnabled: Boolean(source.autoFillEnabled),
    autoFillMode: AUTO_FILL_MODE_OPTIONS.includes(source.autoFillMode as AutoFillMode)
      ? (source.autoFillMode as AutoFillMode)
      : "auto",
    targetQueueSize: Math.min(
      200,
      Math.max(5, Number.isFinite(source.targetQueueSize) ? Number(source.targetQueueSize) : 20)
    ),
    allowExplicit: Boolean(source.allowExplicit),
    fadeSeconds: Math.min(
      12,
      Math.max(0, Number.isFinite(source.fadeSeconds) ? Number(source.fadeSeconds) : 0)
    ),
    transitionProfile: TRANSITION_PROFILE_OPTIONS.includes(
      source.transitionProfile as TransitionProfile
    )
      ? (source.transitionProfile as TransitionProfile)
      : "balanced",
    suggestionsEnabled: source.suggestionsEnabled !== false,
    suggestionThreshold: Math.min(
      20,
      Math.max(1, Number.isFinite(source.suggestionThreshold) ? Number(source.suggestionThreshold) : 3)
    ),
    // Bestehende Partys ohne dieses Feld behalten das bisherige Verhalten (sichtbar).
    showNowPlaying: source.showNowPlaying !== false,
  };
}
