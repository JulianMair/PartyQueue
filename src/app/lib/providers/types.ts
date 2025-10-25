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
<<<<<<< HEAD
  durationMs?: number;
  progressMs?: number;
  isplaying?: boolean;
=======
>>>>>>> 3f5dd52 (Initial commit)
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

  // Playlist-Funktionen
  getPlaylists(): Promise<Playlist[]>;
  getPlaylistTracks(playlistId: string): Promise<Track[]>;
  playPlaylist(playlistId: string): Promise<void>;
}
