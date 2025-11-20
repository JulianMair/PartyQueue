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
  albumArt?: string;
  durationMs?: number;
  progressMs?: number;
  isplaying?: boolean;
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
  queueTrack(uri: string): Promise<void>;
  getCurrentPlayback(): Promise<any>;
  playTrackList(uris: string[]): Promise<void>;
  getQueue(): Promise<any>;

  // Playlist-Funktionen
  getPlaylists(): Promise<Playlist[]>;
  getPlaylistTracks(playlistId: string, offset?: number, limit?: number): Promise<{ tracks: Track[]; next: string | null }>;
  playPlaylist(playlistId: string): Promise<void>;

}
