import { MusicProvider, UserProfile, Track, Playlist } from "../types";
import * as Player from "./player";
import * as Playlists from "./playlists";
import { getSpotifyToken } from "./auth";

export class SpotifyProvider implements MusicProvider {
  async playTrackList(uris: string[]): Promise<void> {
    const token = await getSpotifyToken();
    await fetch("https://api.spotify.com/v1/me/player/play", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        uris,
      }),
    });
  }
  async getMe(): Promise<UserProfile> {
    const token = await getSpotifyToken();
    const res = await fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
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
  queueTrack = Player.queueTrack;
  getCurrentPlayback = Player.getCurrentPlayback;
  getQueue = Player.getQueue;

  getPlaylists = Playlists.getPlaylists;
  getPlaylistTracks = Playlists.getPlaylistTracks;
  playPlaylist = Playlists.playPlaylist;
}
