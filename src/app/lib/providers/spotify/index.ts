import { MusicProvider, UserProfile, Track, Playlist } from "../types";
import * as Player from "./player";
import * as Playlists from "./playlists";
import { spotifyApiFetch } from "./auth";

export class SpotifyProvider implements MusicProvider {
  async playTrackList(uris: string[]): Promise<void> {
    await spotifyApiFetch("https://api.spotify.com/v1/me/player/play", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uris,
      }),
    });
  }
  async getMe(): Promise<UserProfile> {
    const res = await spotifyApiFetch("https://api.spotify.com/v1/me");
    if (!res.ok) throw new Error("Failed to fetch Spotify profile");
    const data = await res.json();
    return {
      id: data.id,
      displayName: data.display_name,
      avatarUrl: data.images?.[0]?.url,
    };
  }

  getCurrentTrack = Player.getCurrentTrack;
  play = Player.play;
  pause = Player.pause;
  next = Player.next;
  setVolume = Player.setVolume;
  queueTrack = Player.queueTrack;
  getCurrentPlayback = Player.getCurrentPlayback;
  getQueue = Player.getQueue;

  getPlaylists = Playlists.getPlaylists;
  getPlaylistTracks = Playlists.getPlaylistTracks;
  searchTracks = Playlists.searchTracks;
  playPlaylist = Playlists.playPlaylist;
}
