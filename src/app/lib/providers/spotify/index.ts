import { MusicProvider, UserProfile, Track, Playlist } from "../types";
import * as Player from "./player";
import * as Playlists from "./playlists";
import { getSpotifyToken } from "./auth";

export class SpotifyProvider implements MusicProvider {
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

  getPlaylists = Playlists.getPlaylists;
  getPlaylistTracks = Playlists.getPlaylistTracks;
  playPlaylist = Playlists.playPlaylist;
}
