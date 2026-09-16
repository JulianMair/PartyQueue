export const TRANSITION_PROFILE_OPTIONS = ["smooth", "balanced", "aggressive"] as const;
export type TransitionProfile = (typeof TRANSITION_PROFILE_OPTIONS)[number];

export interface PartySettings {
  autoFillEnabled: boolean;
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
