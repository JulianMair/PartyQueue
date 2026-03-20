import { spotifyApiFetch } from "./auth";
import { Track } from "../types";

export async function getCurrentTrack(): Promise<Track | null> {
  const res = await spotifyApiFetch("https://api.spotify.com/v1/me/player/currently-playing");

  if (res.status === 204) return null;
  if (!res.ok) throw new Error("Failed to fetch current track");

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
  await spotifyApiFetch("https://api.spotify.com/v1/me/player/play", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: uri ? JSON.stringify({ uris: [uri] }) : undefined,
  });
}

export async function pause(): Promise<void> {
  await spotifyApiFetch("https://api.spotify.com/v1/me/player/pause", {
    method: "PUT",
  });
}

export async function next(): Promise<void> {
  await spotifyApiFetch("https://api.spotify.com/v1/me/player/next", {
    method: "POST",
  });
}

export async function setVolume(volumePercent: number): Promise<void> {
  const safeVolume = Math.max(0, Math.min(100, Math.round(volumePercent)));
  await spotifyApiFetch(
    `https://api.spotify.com/v1/me/player/volume?volume_percent=${safeVolume}`,
    { method: "PUT" }
  );
}
export async function queueTrack(uri: string) {
    await spotifyApiFetch(`https://api.spotify.com/v1/me/player/queue?uri=${encodeURIComponent(uri)}`, {
      method: "POST",
    });
}
export async function getCurrentPlayback() {
  const res = await spotifyApiFetch("https://api.spotify.com/v1/me/player", {
    headers: { "Content-Type": "application/json" },
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
  const res = await spotifyApiFetch("https://api.spotify.com/v1/me/player/queue", {
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) {
    console.error("Spotify /me/player/queue error:", await res.text());
    return null;
  }

  return await res.json(); // hat: currently_playing, queue[]
}
