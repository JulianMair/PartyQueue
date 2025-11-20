import { getSpotifyToken } from "./auth";
import { Track } from "../types";

export async function getCurrentTrack(): Promise<Track | null> {
  const token = await getSpotifyToken();
  const res = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 204) return null;

  const data = await res.json();
  return {
    id: data.item.id,
    name: data.item.name,
    artist: data.item.artists.map((a: any) => a.name).join(", "),
    uri: data.item.uri,
    albumArt: data.item.album.images?.[0]?.url,
    durationMs: data.item.duration_ms,
    progressMs: data.progress_ms,
    isplaying: data.is_playing,
  };
}

export async function play(uri?: string): Promise<void> {
  const token = await getSpotifyToken();
  await fetch("https://api.spotify.com/v1/me/player/play", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: uri ? JSON.stringify({ uris: [uri] }) : undefined,
  });
}

export async function pause(): Promise<void> {
  const token = await getSpotifyToken();
  await fetch("https://api.spotify.com/v1/me/player/pause", {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function next(): Promise<void> {
  const token = await getSpotifyToken();
  await fetch("https://api.spotify.com/v1/me/player/next", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}
export async function queueTrack(uri: string) {
    const token = await getSpotifyToken();
    await fetch(`https://api.spotify.com/v1/me/player/queue?uri=${encodeURIComponent(uri)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
}
export async function getCurrentPlayback() {
  const token = await getSpotifyToken();
  const res = await fetch("https://api.spotify.com/v1/me/player", {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  console.log("Spotify /me/player status:", res.status);

  if (res.status === 204) return null;
  if (!res.ok) {
    console.error("Spotify /me/player error:", await res.text());
    return null;
  }

  return await res.json(); // hat: item, progress_ms, is_playing, etc.
}

export async function getQueue() {
  const token = await getSpotifyToken();
  const res = await fetch("https://api.spotify.com/v1/me/player/queue", {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    console.error("Spotify /me/player/queue error:", await res.text());
    return null;
  }

  return await res.json(); // hat: currently_playing, queue[]
}

