export const PARTY_GENRE_OPTIONS = [
  "Rock",
  "Hip-Hop",
  "Pop",
  "Schlager",
  "Techno",
  "House",
  "EDM",
  "90s",
  "R&B",
  "Latin",
  "Indie",
] as const;

export type PartyGenre = (typeof PARTY_GENRE_OPTIONS)[number];

export interface PartySettings {
  genres: PartyGenre[];
  autoFillEnabled: boolean;
  targetQueueSize: number;
  allowExplicit: boolean;
  fadeSeconds: number;
}

export const DEFAULT_PARTY_SETTINGS: PartySettings = {
  genres: [],
  autoFillEnabled: false,
  targetQueueSize: 20,
  allowExplicit: false,
  fadeSeconds: 0,
};

export function sanitizePartySettings(input: unknown): PartySettings {
  const source = (input && typeof input === "object" ? input : {}) as Partial<PartySettings>;
  const selectedGenres = Array.isArray(source.genres)
    ? source.genres.filter((genre): genre is PartyGenre =>
        PARTY_GENRE_OPTIONS.includes(genre as PartyGenre)
      )
    : [];

  return {
    genres: Array.from(new Set(selectedGenres)),
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
  };
}
