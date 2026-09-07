export interface UserProfile {
  id: string;
  displayName: string;
  avatarUrl?: string;
}

export interface Track {
  id: string;
  name: string;
  artist: string;
  uri: string;
  previewUrl?: string | null;
  albumArt?: string;
  durationMs?: number;
  progressMs?: number;
  /** Zeitpunkt (Date.now() auf Server) wann progressMs zuletzt aus Spotify gelesen wurde. */
  progressObservedAt?: number;
  isplaying?: boolean;
  explicit?: boolean;
}

export interface PartyTrack extends Track {
  votes: number;
  addedAt: number;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  uri: string;
}

export interface MusicProvider {
  getMe(): Promise<UserProfile>;
  getCurrentTrack(): Promise<Track | null>;
  play(uri?: string): Promise<void>;
  pause(): Promise<void>;
  next(): Promise<void>;
  setVolume(volumePercent: number): Promise<void>;
  queueTrack(uri: string): Promise<void>;
  getCurrentPlayback(): Promise<any>;
  playTrackList(uris: string[]): Promise<void>;
  getQueue(): Promise<any>;

  // Playlist-Funktionen
  getPlaylists(): Promise<Playlist[]>;
  getPlaylistTracks(playlistId: string, offset?: number, limit?: number): Promise<{ tracks: Track[]; next: string | null }>;
  searchTracks(query: string, limit?: number): Promise<Track[]>;
  playPlaylist(playlistId: string): Promise<void>;

}

/**
 * Klangliche Merkmale eines Titels (Story B1).
 *
 * Spotify liefert diese Werte seit November 2024 für neu angelegte Apps
 * nicht mehr aus, deshalb kommen sie von einem anderen Anbieter. Die
 * Wertebereiche folgen der aus Spotify bekannten Skala, damit spätere
 * Berechnungen unabhängig von der Quelle gleich rechnen können.
 */
export interface AudioFeatures {
  /** Geschwindigkeit in Schlägen pro Minute, typisch 60 bis 200. */
  tempo: number;
  /** Wie treibend ein Titel wirkt, 0 bis 1. */
  energy: number;
  /** Wie sehr er zum Tanzen einlädt, 0 bis 1. */
  danceability: number;
  /** Grundstimmung von düster (0) bis fröhlich (1). */
  valence: number;
}

/**
 * Anbieter für Audio-Merkmale.
 *
 * Bewusst getrennt vom MusicProvider: Wiedergabe und Merkmale kommen aus
 * verschiedenen Quellen. Wer die Merkmale liefert, soll austauschbar sein,
 * ohne dass der aufrufende Code davon etwas mitbekommt.
 */
export interface AudioFeatureProvider {
  /** Name des Anbieters, nur für Protokollausgaben. */
  readonly name: string;

  /**
   * Liefert die Merkmale zu den angefragten Spotify-Track-IDs.
   *
   * Das Ergebnis enthält für **jede** angefragte ID einen Eintrag. Titel,
   * zu denen es keine Merkmale gibt, stehen mit null darin. So sieht der
   * Aufrufer den Unterschied zwischen "nicht gefragt" und "nichts gefunden",
   * ohne dass ein Fehler geworfen wird.
   */
  getAudioFeatures(trackIds: string[]): Promise<Map<string, AudioFeatures | null>>;
}
