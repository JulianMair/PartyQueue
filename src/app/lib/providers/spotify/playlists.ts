import { getSpotifyToken } from "./auth";
import { Playlist, Track } from "../types";

export async function getPlaylists(): Promise<Playlist[]> {
  const token = await getSpotifyToken();

  const res = await fetch("https://api.spotify.com/v1/me/playlists?limit=50", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store", // Edge-Caching verhindern
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Spotify /me/playlists error:", res.status, err);
    throw new Error("Failed to fetch playlists");
  }

  const data = await res.json();
  // Optional: loggen, um zu sehen, was Spotify sendet
  // console.log("total:", data.total, "returned:", data.items.length, "next:", data.next);

  

  return data.items.map((item: any) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      imageUrl: item.images?.[0]?.url,
      uri: item.uri,
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
    durationMs: item.track.duration_ms,
    progressMs: 0,
    isplaying: false,
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
