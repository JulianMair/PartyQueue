import { getSpotifyToken } from "./auth";
import { Playlist, Track } from "../types";

export async function getPlaylists(): Promise<Playlist[]> {
  const token = await getSpotifyToken();
  const res = await fetch("https://api.spotify.com/v1/me/playlists", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();

  return data.items.map((p: any) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    imageUrl: p.images?.[0]?.url,
    uri: p.uri,
  }));
}

export async function getPlaylistTracks(playlistId: string): Promise<Track[]> {
  const token = await getSpotifyToken();
  const res = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();

  return data.items.map((item: any) => ({
    id: item.track.id,
    name: item.track.name,
    artist: item.track.artists.map((a: any) => a.name).join(", "),
    uri: item.track.uri,
    albumArt: item.track.album.images?.[0]?.url,
  }));
}

export async function playPlaylist(playlistId: string): Promise<void> {
  const token = await getSpotifyToken();
  await fetch("https://api.spotify.com/v1/me/player/play", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ context_uri: `spotify:playlist:${playlistId}` }),
  });
}
