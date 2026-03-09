"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Play, Pause, SkipForward, SkipBack } from "lucide-react";
import { Track } from "../lib/providers/types";
import { useParty } from "@/app/context/PartyContext";

const SPOTIFY_SDK_SRC = "https://sdk.scdn.co/spotify-player.js";

declare global {
  interface Window {
    Spotify: any;
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

export default function FooterPlayer() {
  const [player, setPlayer] = useState<any>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [track, setTrack] = useState<Track | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const [volume, setVolume] = useState<number | null>(null);
  const { partyId } = useParty();
  const volumeUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchAccessToken = async (): Promise<string | null> => {
    try {
      const res = await fetch("/api/auth/token", { cache: "no-store" });
      if (!res.ok) return null;
      const data = await res.json();
      return typeof data?.access_token === "string" ? data.access_token : null;
    } catch (err) {
      console.error("Token Fetch Error:", err);
      return null;
    }
  };

  const fetchCurrentTrackFallback = async () => {
    try {
      const res = await fetch("/api/music/current", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.id) setTrack(data);
    } catch (err) {
      console.error("Current Playback Fetch Error:", err);
    }
  };

  const fetchCurrentVolume = async () => {
    try {
      const token = await fetchAccessToken();
      if (!token) return;
      const res = await fetch("https://api.spotify.com/v1/me/player", {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      if (!res.ok) return;
      const data = await res.json();
      const value = data?.device?.volume_percent;
      if (typeof value === "number") {
        setVolume(Math.max(0, Math.min(100, Math.round(value))));
      }
    } catch (err) {
      console.error("Current Volume Fetch Error:", err);
    }
  };

  const setSpotifyVolume = async (volumePercent: number) => {
    const token = await fetchAccessToken();
    if (!token) throw new Error("Missing access token");

    const query = new URLSearchParams({
      volume_percent: String(volumePercent),
    });
    if (deviceId) query.set("device_id", deviceId);

    await fetch(`https://api.spotify.com/v1/me/player/volume?${query.toString()}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  };

  const handleVolumeChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextVolume = Number(event.target.value);
    setVolume(nextVolume);

    if (volumeUpdateTimeoutRef.current) clearTimeout(volumeUpdateTimeoutRef.current);
    volumeUpdateTimeoutRef.current = setTimeout(async () => {
      try {
        await setSpotifyVolume(nextVolume);
      } catch (err) {
        console.error("Volume Update Error:", err);
      }
    }, 200);
  };

  // Spotify Script laden
  useEffect(() => {
    let isCancelled = false;
    let mountedPlayer: any = null;

    const ensureSpotifySdk = async () => {
      if (!document.querySelector(`script[src="${SPOTIFY_SDK_SRC}"]`)) {
        const script = document.createElement("script");
        script.src = SPOTIFY_SDK_SRC;
        script.async = true;
        document.body.appendChild(script);
      }

      const timeoutMs = 7000;
      const intervalMs = 100;
      const startedAt = Date.now();
      while (!window.Spotify) {
        if (Date.now() - startedAt > timeoutMs) {
          throw new Error("Spotify SDK load timeout");
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    };

    const initPlayer = async () => {
      try {
        setIsConnecting(true);
        await ensureSpotifySdk();
        if (isCancelled || !window.Spotify) return;

        console.log("🎧 Spotify Web Playback SDK ready");

        const newPlayer = new window.Spotify.Player({
          name: "Party Player",
          getOAuthToken: async (cb: (token: string) => void) => {
            const token = await fetchAccessToken();
            cb(token ?? "");
          },
          volume: 0.5,
        });
        mountedPlayer = newPlayer;

        // Player Events
        newPlayer.addListener("ready", async ({ device_id }: any) => {
          console.log("✅ Spotify Player ready:", device_id);
          setDeviceId(device_id);
          setIsReady(true);
          setPlayer(newPlayer);

          // Gerät aktivieren (wie Spotify-Web)
          setIsConnecting(true);
          try {
            const token = await fetchAccessToken();
            if (!token) throw new Error("Missing access token");

            await fetch("https://api.spotify.com/v1/me/player", {
              method: "PUT",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ device_ids: [device_id], play: false }),
            });

            console.log("🟢 Gerät bei Spotify aktiviert, warte auf Sync...");
            // 2 Sekunden warten, bis Spotify intern das Device synchronisiert
            await new Promise((r) => setTimeout(r, 2000));
            if (!isCancelled) {
              setIsConnecting(false);
              await fetchCurrentTrackFallback();
              await fetchCurrentVolume();
            }
          } catch (err) {
            console.error("Fehler beim Aktivieren des Geräts:", err);
            if (!isCancelled) setIsConnecting(false);
          }
        });

        newPlayer.addListener("not_ready", ({ device_id }: any) => {
          console.log("⚠️ Device offline:", device_id);
          setIsReady(false);
        });

        newPlayer.addListener("player_state_changed", (state: any) => {
          const current = state?.track_window?.current_track;
          if (!current) return;
          setTrack({
            id: current.id,
            uri: current.uri,
            name: current.name,
            artist: current.artists.map((a: any) => a.name).join(", "),
            albumArt: current.album.images?.[0]?.url,
            durationMs: state.duration,
            progressMs: state.position,
            isplaying: !state.paused,
          });
        });

        // Fehlerhandling
        newPlayer.addListener("initialization_error", ({ message }: any) =>
          console.error("Init error:", message)
        );
        newPlayer.addListener("authentication_error", ({ message }: any) =>
          console.error("Auth error:", message)
        );
        newPlayer.addListener("account_error", ({ message }: any) =>
          console.error("Account error:", message)
        );
        newPlayer.addListener("playback_error", ({ message }: any) =>
          console.error("Playback error:", message)
        );

        const success = await newPlayer.connect();
        if (success) {
          console.log("🟢 Spotify SDK connected!");
          await fetchCurrentTrackFallback();
          await fetchCurrentVolume();
        } else {
          console.warn("❌ Spotify SDK connection failed!");
          setIsConnecting(false);
        }
      } catch (err) {
        console.error("Spotify Player Init Error:", err);
        if (!isCancelled) setIsConnecting(false);
      }
    };

    initPlayer();

    return () => {
      isCancelled = true;
      if (volumeUpdateTimeoutRef.current) clearTimeout(volumeUpdateTimeoutRef.current);
      if (mountedPlayer) mountedPlayer.disconnect();
    };
  }, []);

  // Fortschritt lokal animieren
  useEffect(() => {
    if (!track || !track.isplaying) return;

    const start = Date.now();
    const initial = track.progressMs ?? 0;

    const interval = setInterval(() => {
      setTrack((prev) => {
        if (!prev || !prev.isplaying) return prev;
        const elapsed = Date.now() - start;
        const newProgress = initial + elapsed;

        if (newProgress >= (prev.durationMs ?? 0)) {
          clearInterval(interval);
          return { ...prev, progressMs: prev.durationMs ?? 0 };
        }

        return { ...prev, progressMs: newProgress };
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [track?.isplaying, track?.id]);

  // 🧠 Player sicher abfragen
  const getPlayerState = async () => {
    try {
      const state = await player?.getCurrentState();
      return state ?? null;
    } catch {
      return null;
    }
  };

  // --- Steuerfunktionen ---
  const handlePlayPause = async () => {
    if (!player) return;

    const state = await getPlayerState();

    if (!state) {
      // kein aktiver State → via API aktivieren
      try {
        const token = await fetchAccessToken();
        if (!token) throw new Error("Missing access token");
        await fetch("https://api.spotify.com/v1/me/player/play", {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ device_id: deviceId }),
        });
      } catch (err) {
        console.error("API-Play fehlgeschlagen:", err);
      }
      return;
    }

    try {
      if (state.paused) await player.resume();
      else await player.pause();
    } catch (err) {
      console.error("Play/Pause-Fehler:", err);
    }
  };

  const handleNext = async () => {
    try {
      let effectivePartyId = partyId;
      if (!effectivePartyId) {
        const activeRes = await fetch("/api/party/active", { cache: "no-store" });
        if (activeRes.ok) {
          const activeData = await activeRes.json();
          if (activeData?.partyId) {
            effectivePartyId = activeData.partyId;
          }
        }
      }

      if (!effectivePartyId) return;

      await fetch("/api/party/next", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partyId: effectivePartyId }),
      });
    } catch (err) {
      console.error("Next-Fehler:", err);
    }
  };

  const handlePrev = async () => {
    try {
      const state = await getPlayerState();
      if (!state) return;
      await player.previousTrack();
    } catch (err) {
      console.error("Prev-Fehler:", err);
    }
  };

  const activatePlayer = async () => {
    try {
      await player?.activateElement?.();
    } catch (err) {
      console.error("Fehler beim Aktivieren des Players:", err);
    }
  };

  const formatTime = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, "0")}`;
  };

  // --- Render ---
  if (!track)
    return (
      <footer className="h-24 bg-neutral-900 text-gray-300 flex items-center justify-center border-t border-neutral-800">
        {isConnecting ? (
          <p>🔄 Verbinde mit Spotify...</p>
        ) : (
          <p>🎶 Lade Spotify Player...</p>
        )}
      </footer>
    );

  return (
    <footer className="h-24 bg-neutral-900 text-gray-200 flex items-center justify-between px-6 border-t border-neutral-800 shadow-[0_-2px_10px_rgba(0,0,0,0.5)]">
      {/* Song Infos */}
      <div className="flex items-center gap-4 w-1/3">
        <img
          src={track.albumArt}
          alt={track.name}
          className="w-14 h-14 rounded-md object-cover shadow-lg"
        />
        <div>
          <p className="font-medium text-gray-100">{track.name}</p>
          <p className="text-sm text-gray-400">{track.artist}</p>
        </div>
      </div>

      {/* Steuerung */}
      <div className="flex flex-col items-center w-1/3">
        <div className="flex items-center gap-6 mb-2">
          <button
            onClick={handlePrev}
            className="text-gray-300 hover:text-white transition"
          >
            <SkipBack size={22} />
          </button>
          <button
            onClick={handlePlayPause}
            className="bg-white text-black p-3 rounded-full hover:bg-gray-300 transition"
          >
            {track.isplaying ? <Pause size={22} /> : <Play size={22} />}
          </button>
          <button
            onClick={handleNext}
            className="text-gray-300 hover:text-white transition"
          >
            <SkipForward size={22} />
          </button>
        </div>

        {/* Fortschrittsleiste */}
        <div className="flex items-center gap-2 w-150">
          <span className="text-xs text-gray-400">
            {formatTime(track.progressMs || 0)}
          </span>
          <div className="relative flex-1 h-1 bg-neutral-700 rounded-full overflow-hidden">
            <div
              className="absolute h-1 bg-green-500 rounded-full"
              style={{
                width: `${(track.progressMs && track.durationMs
                  ? track.progressMs / track.durationMs
                  : 0) * 100}%`,
              }}
            />
          </div>
          <span className="text-xs text-gray-400">
            {formatTime(track.durationMs || 0)}
          </span>
        </div>
      </div>

      {/* Rechts */}
      <div className="w-1/3 flex flex-col items-end gap-2">
        <div className="flex items-center gap-3 w-56">
          <span className="text-xs text-gray-400 w-9 text-right">
            {volume !== null ? `${volume}%` : "--"}
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={volume ?? 50}
            onChange={handleVolumeChange}
            className="w-full h-1 bg-neutral-700 rounded-lg accent-green-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!isReady}
            aria-label="Lautstärke"
          />
        </div>

        <div
          onClick={activatePlayer}
          className="text-right text-sm text-gray-400 cursor-pointer"
        >
          {isConnecting
            ? "🟡 Verbindung wird hergestellt..."
            : isReady
            ? "🟢 Verbunden"
            : "⚫️ Nicht verbunden"}
        </div>
      </div>
    </footer>
  );
}
