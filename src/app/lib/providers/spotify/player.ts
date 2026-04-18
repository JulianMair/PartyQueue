import { spotifyApiFetch } from "./auth";
import { Track } from "../types";

// Aktive SDK-Device-ID, gesetzt vom FooterPlayer via /api/party/device
let activeDeviceId: string | null = null;
export function setActiveDeviceId(id: string | null) { activeDeviceId = id; }
export function getActiveDeviceId() { return activeDeviceId; }

// Fallback: Wenn activeDeviceId noch nicht registriert ist (z.B. direkt nach
// Server-Restart, bevor FooterPlayer sich melden konnte), frage Spotify nach
// verfügbaren Devices und cache das erste aktive.
let deviceResolutionInFlight: Promise<string | null> | null = null;
async function resolveDeviceIdFromSpotify(): Promise<string | null> {
  if (deviceResolutionInFlight) return deviceResolutionInFlight;
  deviceResolutionInFlight = (async () => {
    try {
      const res = await spotifyApiFetch("https://api.spotify.com/v1/me/player/devices");
      if (!res.ok) return null;
      const data = await res.json();
      const devices: Array<{ id: string; is_active: boolean }> = Array.isArray(data?.devices)
        ? data.devices
        : [];
      if (devices.length === 0) return null;
      const active = devices.find((d) => d.is_active && d.id);
      const chosen = active?.id ?? devices.find((d) => d.id)?.id ?? null;
      if (chosen) {
        activeDeviceId = chosen;
        console.log(`[spotify/player] Device-ID via /devices-Fallback aufgelöst: ${chosen}`);
      }
      return chosen;
    } catch (err) {
      console.warn("[spotify/player] Device-Resolution fehlgeschlagen:", err);
      return null;
    } finally {
      deviceResolutionInFlight = null;
    }
  })();
  return deviceResolutionInFlight;
}

export async function getCurrentTrack(): Promise<Track | null> {
  const res = await spotifyApiFetch("https://api.spotify.com/v1/me/player/currently-playing");

  if (res.status === 204) return null;
  if (!res.ok) throw new Error("Failed to fetch current track");

  // Spotify liefert gelegentlich 200 mit leerem Body oder {item: null}
  // (z.B. bei Werbung, Podcasts, oder wenn currently_playing_type !== "track").
  const text = await res.text();
  if (!text) return null;
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  const item = data?.item;
  if (!item || typeof item.id !== "string") return null;

  const artistList = Array.isArray(item.artists)
    ? item.artists.map((a: any) => a?.name).filter(Boolean).join(", ")
    : "";

  return {
    id: item.id,
    name: item.name ?? "",
    artist: artistList,
    uri: item.uri ?? "",
    previewUrl: item.preview_url ?? null,
    albumArt: item.album?.images?.[0]?.url,
    durationMs: typeof item.duration_ms === "number" ? item.duration_ms : undefined,
    progressMs: typeof data.progress_ms === "number" ? data.progress_ms : undefined,
    isplaying: data.is_playing === true,
  };
}

export async function play(uri?: string): Promise<void> {
  // Wenn Device noch nicht registriert ist, versuchen wir es über Spotify aufzulösen,
  // damit der play()-Call nicht auf einem falschen / stummgestellten Alt-Device landet.
  let deviceId = activeDeviceId;
  if (!deviceId) {
    deviceId = await resolveDeviceIdFromSpotify();
  }

  const body: Record<string, unknown> = {};
  if (uri) body.uris = [uri];
  if (deviceId) body.device_id = deviceId;

  const url = deviceId
    ? `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(deviceId)}`
    : "https://api.spotify.com/v1/me/player/play";

  const res = await spotifyApiFetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  // 204 = success, 200 = success with body, alles andere = Fehler
  if (!res.ok && res.status !== 204) {
    const text = await res.text().catch(() => "");
    throw new Error(`Spotify play failed (${res.status}): ${text}`);
  }
}

export async function pause(): Promise<void> {
  const url = activeDeviceId
    ? `https://api.spotify.com/v1/me/player/pause?device_id=${encodeURIComponent(activeDeviceId)}`
    : "https://api.spotify.com/v1/me/player/pause";
  const res = await spotifyApiFetch(url, { method: "PUT" });
  // 204 = success, 403 = "already paused" (tolerieren), alles andere = Fehler
  if (!res.ok && res.status !== 204 && res.status !== 403) {
    const text = await res.text().catch(() => "");
    throw new Error(`Spotify pause failed (${res.status}): ${text}`);
  }
}

export async function next(): Promise<void> {
  const url = activeDeviceId
    ? `https://api.spotify.com/v1/me/player/next?device_id=${encodeURIComponent(activeDeviceId)}`
    : "https://api.spotify.com/v1/me/player/next";
  const res = await spotifyApiFetch(url, { method: "POST" });
  if (!res.ok && res.status !== 204) {
    const text = await res.text().catch(() => "");
    throw new Error(`Spotify next failed (${res.status}): ${text}`);
  }
}

export async function setVolume(volumePercent: number): Promise<void> {
  const safeVolume = Math.max(0, Math.min(100, Math.round(volumePercent)));
  const url = activeDeviceId
    ? `https://api.spotify.com/v1/me/player/volume?volume_percent=${safeVolume}&device_id=${encodeURIComponent(activeDeviceId)}`
    : `https://api.spotify.com/v1/me/player/volume?volume_percent=${safeVolume}`;
  const res = await spotifyApiFetch(url, { method: "PUT" });
  if (!res.ok && res.status !== 204) {
    const text = await res.text().catch(() => "");
    throw new Error(`Spotify setVolume failed (${res.status}): ${text}`);
  }
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
