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
  const [seekDraftMs, setSeekDraftMs] = useState<number | null>(null);
  const [isSeeking, setIsSeeking] = useState(false);
  const { partyId } = useParty();
  const volumeUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekDraftRef = useRef<number | null>(null);
  const seekCommitInFlightRef = useRef(false);
  const isSeekingRef = useRef(false);
  const suppressStateUpdatesUntilRef = useRef(0);
  const pendingSeekMsRef = useRef<number | null>(null);
  const recoveringPlayerRef = useRef(false);
  const cachedTokenRef = useRef<{ token: string; fetchedAt: number } | null>(null);
  const tokenFetchInFlightRef = useRef<Promise<string | null> | null>(null);

  // Token laeuft nach 60 Min ab. Nach 50 Min proaktiv refreshen, damit das SDK
  // (das den Token via getOAuthToken-Callback bezieht) nie mit einem abgelaufenen
  // Token rausgeht und in eine 401-Retry-Loop rutscht.
  const TOKEN_CACHE_MAX_AGE_MS = 50 * 60 * 1000;

  const fetchAccessToken = async (forceRefresh = false): Promise<string | null> => {
    if (!forceRefresh && cachedTokenRef.current) {
      const age = Date.now() - cachedTokenRef.current.fetchedAt;
      if (age < TOKEN_CACHE_MAX_AGE_MS) return cachedTokenRef.current.token;
    }
    // Coalescing: Paralleles SDK + spotifyFetch sollen nur einen Refresh ausloesen.
    if (tokenFetchInFlightRef.current) return tokenFetchInFlightRef.current;
    const fetchPromise = (async () => {
      try {
        const res = await fetch("/api/auth/token", { cache: "no-store" });
        if (!res.ok) {
          cachedTokenRef.current = null;
          return null;
        }
        const data = await res.json();
        const token = typeof data?.access_token === "string" ? data.access_token : null;
        if (token) {
          cachedTokenRef.current = { token, fetchedAt: Date.now() };
        } else {
          cachedTokenRef.current = null;
        }
        return token;
      } catch (err) {
        console.error("Token Fetch Error:", err);
        return null;
      } finally {
        tokenFetchInFlightRef.current = null;
      }
    })();
    tokenFetchInFlightRef.current = fetchPromise;
    return fetchPromise;
  };

  /** Spotify API fetch with automatic 401 retry + token refresh */
  const spotifyFetch = async (input: string, init?: RequestInit): Promise<Response> => {
    const token = await fetchAccessToken();
    if (!token) throw new Error("Missing access token");

    const doRequest = (t: string) => {
      const headers = new Headers(init?.headers);
      headers.set("Authorization", `Bearer ${t}`);
      return fetch(input, { ...init, headers });
    };

    const res = await doRequest(token);
    if (res.status !== 401) return res;

    const refreshed = await fetchAccessToken(true);
    if (!refreshed || refreshed === token) return res;
    return doRequest(refreshed);
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

  /**
   * Device-ID ans Backend melden. Bei Netzwerkfehler bis zu 3x mit Backoff erneut versuchen.
   * Wichtig, weil sonst serverseitige play()-Calls ohne device_id rausgehen und auf dem
   * falschen / letzten bekannten Device landen.
   */
  const registerDeviceWithRetry = async (deviceId: string | null, maxAttempts = 3) => {
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await fetch("/api/party/device", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId }),
        });
        if (res.ok) return true;
        lastError = new Error(`HTTP ${res.status}`);
      } catch (err) {
        lastError = err;
      }
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
    console.warn("[FooterPlayer] Device-Registration fehlgeschlagen nach Retries:", lastError);
    return false;
  };

  /**
   * Device-ID beim Backend abmelden. Bei Tab-Close via sendBeacon,
   * damit das Backend nicht mit einer stale Device-ID hängen bleibt.
   */
  const unregisterDevice = (useBeacon = false) => {
    const payload = JSON.stringify({ deviceId: null });
    if (useBeacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon("/api/party/device", blob);
      return;
    }
    fetch("/api/party/device", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch((err) => {
      console.warn("[FooterPlayer] unregisterDevice Fehler:", err);
    });
  };

  const fetchCurrentVolume = async () => {
    try {
      const res = await spotifyFetch("https://api.spotify.com/v1/me/player");
      if (!res.ok) return;
      // Spotify liefert 204 No Content wenn kein aktives Device / Playback vorhanden.
      // res.json() crashed dann mit "Unexpected end of JSON input".
      if (res.status === 204) return;
      const text = await res.text();
      if (!text) return;
      let data: any;
      try { data = JSON.parse(text); } catch { return; }
      const value = data?.device?.volume_percent;
      if (typeof value === "number") {
        setVolume(Math.max(0, Math.min(100, Math.round(value))));
      }
    } catch (err) {
      console.error("Current Volume Fetch Error:", err);
    }
  };

  const setSpotifyVolume = async (volumePercent: number) => {
    const query = new URLSearchParams({
      volume_percent: String(volumePercent),
    });
    if (deviceId) query.set("device_id", deviceId);

    await spotifyFetch(`https://api.spotify.com/v1/me/player/volume?${query.toString()}`, {
      method: "PUT",
    });
  };

  const setSpotifySeek = async (positionMs: number) => {
    const safePositionMs = Math.max(0, Math.floor(positionMs));
    const query = new URLSearchParams({
      position_ms: String(safePositionMs),
    });
    if (deviceId) query.set("device_id", deviceId);

    await spotifyFetch(`https://api.spotify.com/v1/me/player/seek?${query.toString()}`, {
      method: "PUT",
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
    // Merke uns das letzte bereits aktivierte Device, damit wiederholte ready-Events
    // (StrictMode Double-Mount im Dev, oder SDK-internes Reconnect) nicht erneut
    // den Transfer-Call mit play:false ausloesen → der pausiert Spotify.
    let activatedDeviceId: string | null = null;

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

        let lastSdkTokenCallAt = 0;
        const newPlayer = new window.Spotify.Player({
          name: "Party Player",
          getOAuthToken: async (cb: (token: string) => void) => {
            // Wenn das SDK binnen 30s erneut ein Token anfordert, ist das ein
            // Retry-Signal nach 401 → force-refresh, sonst wuerden wir dasselbe
            // abgelaufene Token zurueckgeben und eine Endlos-Loop erzeugen.
            const now = Date.now();
            const forceRefresh = now - lastSdkTokenCallAt < 30_000;
            lastSdkTokenCallAt = now;
            const token = await fetchAccessToken(forceRefresh);
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

          // Device-ID ans Backend melden (idempotent).
          await registerDeviceWithRetry(device_id);

          // Wenn wir dieses Device bereits aktiviert haben, nicht erneut transferieren.
          // Ein zweiter PUT /me/player { play: false } pausiert sonst das laufende Playback.
          if (activatedDeviceId === device_id) {
            console.log("ℹ️ Device bereits aktiviert, skip Transfer");
            if (!isCancelled) setIsConnecting(false);
            return;
          }

          // Gerät aktivieren (wie Spotify-Web)
          setIsConnecting(true);
          try {
            await spotifyFetch("https://api.spotify.com/v1/me/player", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ device_ids: [device_id], play: false }),
            });
            activatedDeviceId = device_id;

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

        newPlayer.addListener("not_ready", async ({ device_id }: any) => {
          console.log("⚠️ Device offline:", device_id);
          setIsReady(false);
          // Track sofort als pausiert markieren – sonst läuft der Progress-Timer weiter
          setTrack((prev) => prev ? { ...prev, isplaying: false } : prev);
          // Auto-reconnect nach 3 Sekunden
          await new Promise((r) => setTimeout(r, 3000));
          if (!isCancelled) {
            console.log("🔄 Versuche Reconnect nach not_ready...");
            try {
              await newPlayer.connect();
            } catch (err) {
              console.error("Reconnect nach not_ready fehlgeschlagen:", err);
            }
          }
        });

        newPlayer.addListener("player_state_changed", (state: any) => {
          const current = state?.track_window?.current_track;
          if (!current) return;

          if (isSeekingRef.current) return;

          const nextProgress =
            typeof state.position === "number" ? state.position : 0;
          const pendingSeekMs = pendingSeekMsRef.current;
          const isSuppressed = Date.now() < suppressStateUpdatesUntilRef.current;
          if (
            isSuppressed &&
            pendingSeekMs !== null &&
            Math.abs(nextProgress - pendingSeekMs) > 2500
          ) {
            return;
          }

          if (
            pendingSeekMs !== null &&
            Math.abs(nextProgress - pendingSeekMs) <= 2500
          ) {
            pendingSeekMsRef.current = null;
          }

          const artistList = Array.isArray(current.artists)
            ? current.artists.map((a: any) => a?.name).filter(Boolean).join(", ")
            : "";
          const albumArt = current.album?.images?.[0]?.url;
          setTrack({
            id: current.id,
            uri: current.uri,
            name: current.name,
            artist: artistList,
            albumArt,
            durationMs: state.duration,
            progressMs: state.position,
            isplaying: !state.paused,
          });
        });

        // Fehlerhandling
        newPlayer.addListener("initialization_error", ({ message }: any) =>
          console.error("Init error:", message)
        );
        newPlayer.addListener("authentication_error", async ({ message }: any) => {
          console.error("Auth error:", message);
          // Token refreshen und reconnecten
          cachedTokenRef.current = null;
          const freshToken = await fetchAccessToken(true);
          if (freshToken && !isCancelled) {
            console.log("🔄 Token refreshed nach Auth-Error, reconnecte...");
            try {
              await newPlayer.connect();
            } catch (err) {
              console.error("Reconnect nach Auth-Error fehlgeschlagen:", err);
            }
          }
        });
        newPlayer.addListener("account_error", ({ message }: any) =>
          console.error("Account error:", message)
        );
        newPlayer.addListener("playback_error", async ({ message }: any) => {
          console.error("Playback error:", message);
          // Recovery versuchen
          if (!isCancelled) {
            await new Promise((r) => setTimeout(r, 1000));
            try {
              const state = await newPlayer.getCurrentState?.();
              if (!state) {
                console.log("🔄 Recovery nach Playback-Error...");
                await recoverPlayerSession();
              }
            } catch (err) {
              console.error("Recovery nach Playback-Error fehlgeschlagen:", err);
            }
          }
        });

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

    // Proaktiver Token-Refresh alle 45 Minuten (Token laeuft nach 60 Min ab)
    const tokenRefreshInterval = setInterval(async () => {
      console.log("🔄 Proaktiver Token-Refresh...");
      cachedTokenRef.current = null;
      await fetchAccessToken(true);
    }, 45 * 60 * 1000);

    // Bei Tab-Close die Device-ID abmelden, damit das Backend nicht mit einer
    // toten Device-ID zurückbleibt und play()-Calls ins Leere gehen.
    const onBeforeUnload = () => {
      unregisterDevice(true);
    };
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", onBeforeUnload);
    }

    return () => {
      isCancelled = true;
      clearInterval(tokenRefreshInterval);
      if (volumeUpdateTimeoutRef.current) clearTimeout(volumeUpdateTimeoutRef.current);
      if (typeof window !== "undefined") {
        window.removeEventListener("beforeunload", onBeforeUnload);
      }
      // Device beim Unmount abmelden (nicht via sendBeacon — normaler fetch reicht).
      unregisterDevice(false);
      if (mountedPlayer) mountedPlayer.disconnect();
    };
  }, []);

  // Fortschritt lokal animieren
  useEffect(() => {
    seekDraftRef.current = seekDraftMs;
  }, [seekDraftMs]);

  useEffect(() => {
    isSeekingRef.current = isSeeking;
  }, [isSeeking]);

  useEffect(() => {
    if (!track || !track.isplaying) return;

    const start = Date.now();
    const initial = track.progressMs ?? 0;

    const interval = setInterval(() => {
      setTrack((prev) => {
        if (!prev || !prev.isplaying) return prev;
        if (isSeeking || seekDraftRef.current !== null) return prev;
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
  }, [track?.isplaying, track?.id, isSeeking]);

  // 🧠 Player sicher abfragen
  const getPlayerState = async () => {
    try {
      const state = await player?.getCurrentState();
      return state ?? null;
    } catch (err) {
      console.warn("[FooterPlayer] getPlayerState Fehler:", err);
      return null;
    }
  };

  // Device-ID regelmäßig re-registrieren, damit das Backend auch nach einem
  // Server-Restart oder verlorenen Request die korrekte Device-ID kennt.
  useEffect(() => {
    if (!deviceId) return;
    const interval = setInterval(() => {
      void registerDeviceWithRetry(deviceId, 1);
    }, 30_000);
    return () => clearInterval(interval);
  }, [deviceId]);

  useEffect(() => {
    if (!player || !deviceId) return;

    const interval = setInterval(async () => {
      try {
        const state = await player.getCurrentState?.();
        if (!state) {
          console.log("🔄 Healthcheck: kein Player-State, starte Recovery...");
          await recoverPlayerSession();
          return;
        }
        // SDK-State mit React-State abgleichen:
        // Wenn das SDK pausiert/gestoppt ist aber React noch isplaying=true zeigt → korrigieren
        const sdkIsPlaying = !state.paused;
        setTrack((prev) => {
          if (!prev) return prev;
          if (prev.isplaying !== sdkIsPlaying) {
            return { ...prev, isplaying: sdkIsPlaying, progressMs: state.position ?? prev.progressMs };
          }
          return prev;
        });
      } catch (err) {
        console.error("Player Healthcheck Error:", err);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [player, deviceId]);

  // --- Steuerfunktionen ---
  const handlePlayPause = async () => {
    if (!player) return;

    const state = await getPlayerState();

    if (!state) {
      // kein aktiver State → via API aktivieren
      try {
        await spotifyFetch("https://api.spotify.com/v1/me/player/play", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
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
        body: JSON.stringify({ partyId: effectivePartyId, applyFade: false }),
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

  const recoverPlayerSession = async () => {
    if (!player || !deviceId || recoveringPlayerRef.current) return;
    recoveringPlayerRef.current = true;
    try {
      await activatePlayer();

      // Nur transferieren wenn unser Device NICHT bereits das aktive ist UND
      // nichts laeuft — sonst pausiert play:false das Playback unnoetig.
      let shouldTransfer = true;
      try {
        const res = await spotifyFetch("https://api.spotify.com/v1/me/player");
        if (res.ok && res.status !== 204) {
          const text = await res.text();
          if (text) {
            const data = JSON.parse(text);
            const activeId = data?.device?.id;
            const isPlaying = data?.is_playing === true;
            // Wenn unser Device bereits aktiv ist oder gerade etwas laeuft,
            // kein Transfer durchfuehren.
            if (activeId === deviceId || isPlaying) {
              shouldTransfer = false;
            }
          }
        }
      } catch {
        // Wenn wir den State nicht lesen koennen, bleibt der Transfer-Fallback.
      }

      if (shouldTransfer) {
        await spotifyFetch("https://api.spotify.com/v1/me/player", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ device_ids: [deviceId], play: false }),
        });
      }

      await fetchCurrentVolume();
      // Nach Recovery echten Track-State holen damit Display korrekt ist
      await fetchCurrentTrackFallback();
    } catch (err) {
      console.error("Player Recovery Error:", err);
    } finally {
      recoveringPlayerRef.current = false;
    }
  };

  const formatTime = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, "0")}`;
  };

  const handleSeekChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextMs = Number(event.target.value);
    setSeekDraftMs(nextMs);
  };

  const commitSeek = async () => {
    if (!track || seekDraftRef.current === null || seekCommitInFlightRef.current) return;
    seekCommitInFlightRef.current = true;
    const duration = track.durationMs ?? 0;
    const nextMs = Math.max(0, Math.min(duration, seekDraftRef.current));
    pendingSeekMsRef.current = nextMs;
    suppressStateUpdatesUntilRef.current = Date.now() + 1800;

    try {
      setTrack((prev) => (prev ? { ...prev, progressMs: nextMs } : prev));
      if (player?.seek) {
        await player.seek(nextMs);
      } else {
        await setSpotifySeek(nextMs);
      }
    } catch (err) {
      console.error("Seek-Fehler:", err);
      pendingSeekMsRef.current = null;
    } finally {
      setIsSeeking(false);
      setSeekDraftMs(null);
      seekDraftRef.current = null;
      seekCommitInFlightRef.current = false;
    }
  };

  // --- Render ---
  if (!track)
    return (
      <footer className="h-full bg-neutral-900 text-gray-300 flex items-center justify-center border-t border-neutral-800 px-3">
        {isConnecting ? (
          <p>🔄 Verbinde mit Spotify...</p>
        ) : (
          <p>🎶 Lade Spotify Player...</p>
        )}
      </footer>
    );

  const effectiveProgressMs = seekDraftMs ?? track.progressMs ?? 0;
  const durationMs = track.durationMs ?? 0;
  const progressPercent =
    durationMs > 0 ? Math.min(100, (effectiveProgressMs / durationMs) * 100) : 0;

  return (
    <footer className="h-full bg-neutral-900 text-gray-200 flex items-center justify-between px-3 md:px-6 border-t border-neutral-800 shadow-[0_-2px_10px_rgba(0,0,0,0.5)]">
      {/* Song Infos */}
      <div className="flex items-center gap-3 md:gap-4 w-1/3 min-w-0">
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
        <div className="flex items-center gap-2 w-full max-w-xl">
          <span className="text-xs text-gray-400">
            {formatTime(effectiveProgressMs)}
          </span>
          <div className="relative flex-1 h-5 flex items-center">
            <div className="absolute inset-x-0 h-1 rounded-full bg-neutral-700" />
            <div
              className="absolute h-1 rounded-full bg-green-500 pointer-events-none"
              style={{ width: `${progressPercent}%` }}
            />
            <input
              type="range"
              min={0}
              max={durationMs || 0}
              step={500}
              value={Math.min(effectiveProgressMs, durationMs || effectiveProgressMs)}
              onMouseDown={() => setIsSeeking(true)}
              onTouchStart={() => setIsSeeking(true)}
              onChange={handleSeekChange}
              onMouseUp={() => void commitSeek()}
              onTouchEnd={() => void commitSeek()}
              onTouchCancel={() => void commitSeek()}
              onKeyUp={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  void commitSeek();
                }
              }}
              onBlur={() => void commitSeek()}
              className="absolute inset-x-0 h-1 appearance-none rounded-full bg-transparent accent-green-500 cursor-pointer"
              disabled={!isReady || !durationMs}
              aria-label="Songposition"
            />
          </div>
          <span className="text-xs text-gray-400">
            {formatTime(durationMs)}
          </span>
        </div>
      </div>

      {/* Rechts */}
      <div className="w-1/3 flex flex-col items-end gap-2">
        <div className="flex items-center gap-3 w-44 md:w-56">
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
