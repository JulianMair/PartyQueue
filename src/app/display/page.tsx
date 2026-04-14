"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "react-qr-code";
import type { PartyTrack } from "@/app/lib/providers/types";

const POLL_INTERVAL_MS = 3000;
const POLL_INTERVAL_HIDDEN_MS = 6000;

interface DisplayData {
  partyId: string;
  version: number;
  isActive: boolean;
  currentTrack: PartyTrack | null;
  queue: PartyTrack[];
}

export default function AutoDisplayPage() {
  const [partyId, setPartyId] = useState<string | null>(null);
  const [data, setData] = useState<DisplayData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progressMs, setProgressMs] = useState(0);
  const inFlightRef = useRef(false);
  const versionRef = useRef(0);
  const lastTrackIdRef = useRef<string | null>(null);
  const progressStartRef = useRef<{
    wallTime: number;
    trackProgress: number;
  } | null>(null);

  const baseUrl =
    typeof window !== "undefined"
      ? `${window.location.protocol}//${window.location.host}`
      : "";
  const voteUrl = partyId ? `${baseUrl}/party/${partyId}/vote` : "";

  /* ------------------------------------------------------------------ */
  /*  Polling – ohne partyId, API löst aktive Party selbst auf          */
  /* ------------------------------------------------------------------ */

  const load = async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const res = await fetch("/api/party/display", { cache: "no-store" });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "Keine aktive Party");
        setData(null);
        setPartyId(json.partyId ?? null);
        return;
      }

      setError(null);

      const nextPartyId = json.partyId as string;
      const nextVersion = json.version ?? 0;

      // Party gewechselt → alles zuruecksetzen
      if (nextPartyId !== partyId) {
        setPartyId(nextPartyId);
        versionRef.current = 0;
        lastTrackIdRef.current = null;
        progressStartRef.current = null;
        setProgressMs(0);
      }

      if (nextVersion !== versionRef.current || !data || nextPartyId !== partyId) {
        versionRef.current = nextVersion;
        setData(json as DisplayData);
      }

      // Progress sync
      const ct = json.currentTrack as PartyTrack | null;
      const trackChanged = ct?.id !== lastTrackIdRef.current;
      lastTrackIdRef.current = ct?.id ?? null;

      if (ct?.isplaying && typeof ct.progressMs === "number") {
        if (trackChanged) {
          // Neuer Track → Progress frisch starten
          progressStartRef.current = {
            wallTime: Date.now(),
            trackProgress: ct.progressMs,
          };
          setProgressMs(ct.progressMs);
        } else {
          // Gleicher Track → Referenz aktualisieren fuer genauere Interpolation
          progressStartRef.current = {
            wallTime: Date.now(),
            trackProgress: ct.progressMs,
          };
        }
      } else if (ct && !ct.isplaying) {
        progressStartRef.current = null;
        setProgressMs(ct.progressMs ?? 0);
      } else {
        progressStartRef.current = null;
        setProgressMs(0);
      }
    } catch {
      setError("Netzwerkfehler");
    } finally {
      inFlightRef.current = false;
    }
  };

  useEffect(() => {
    let isCancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const run = async () => {
      if (isCancelled) return;
      await load();
      if (isCancelled) return;
      const delay = document.hidden ? POLL_INTERVAL_HIDDEN_MS : POLL_INTERVAL_MS;
      timer = setTimeout(run, delay);
    };

    void run();

    const onVisibility = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      isCancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [partyId]);

  /* ------------------------------------------------------------------ */
  /*  Local progress animation                                          */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    const ct = data?.currentTrack;
    if (!ct?.isplaying || !progressStartRef.current) return;

    const interval = setInterval(() => {
      const ref = progressStartRef.current;
      if (!ref) return;
      const elapsed = Date.now() - ref.wallTime;
      const next = Math.min(ref.trackProgress + elapsed, ct.durationMs ?? 0);
      setProgressMs(next);
    }, 500);

    return () => clearInterval(interval);
  }, [data?.currentTrack?.id, data?.currentTrack?.isplaying]);

  /* ------------------------------------------------------------------ */
  /*  Helpers                                                           */
  /* ------------------------------------------------------------------ */

  const formatTime = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, "0")}`;
  };

  /* ------------------------------------------------------------------ */
  /*  Render                                                            */
  /* ------------------------------------------------------------------ */

  // Warten auf aktive Party
  if (!data && !error) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center">
        <p className="text-neutral-500 text-xl">Verbinde mit Party...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center">
        <p className="text-neutral-500 text-xl">{error}</p>
      </div>
    );
  }

  const ct = data?.currentTrack ?? null;
  const queue = data?.queue ?? [];
  const durationMs = ct?.durationMs ?? 0;
  const progressPercent =
    durationMs > 0 ? Math.min(100, (progressMs / durationMs) * 100) : 0;

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col overflow-hidden select-none">
      {/* Error banner */}
      {error && (
        <div className="bg-red-900/60 text-red-200 text-center py-2 text-sm">
          {error}
        </div>
      )}

      {/* Main content: two-column layout */}
      <div className="flex-1 flex min-h-0">
        {/* Left: Now Playing + Queue */}
        <div className="flex-1 flex flex-col p-6 lg:p-10 min-w-0">
          {/* Now Playing */}
          <div className="mb-8">
            <h2 className="text-neutral-500 text-sm font-semibold uppercase tracking-widest mb-4">
              Aktueller Song
            </h2>

            {ct ? (
              <div className="flex items-center gap-6">
                {ct.albumArt ? (
                  <img
                    src={ct.albumArt}
                    alt={ct.name}
                    className="w-32 h-32 lg:w-44 lg:h-44 rounded-xl object-cover shadow-2xl shadow-black/50 flex-shrink-0"
                  />
                ) : (
                  <div className="w-32 h-32 lg:w-44 lg:h-44 rounded-xl bg-neutral-800 flex-shrink-0" />
                )}

                <div className="min-w-0 flex-1">
                  <p className="text-2xl lg:text-4xl font-bold truncate">
                    {ct.name}
                  </p>
                  <p className="text-lg lg:text-xl text-neutral-400 truncate mt-1">
                    {ct.artist}
                  </p>

                  {/* Progress bar */}
                  <div className="mt-4 flex items-center gap-3">
                    <span className="text-xs text-neutral-500 tabular-nums w-10 text-right">
                      {formatTime(progressMs)}
                    </span>
                    <div className="flex-1 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 rounded-full transition-[width] duration-500 ease-linear"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                    <span className="text-xs text-neutral-500 tabular-nums w-10">
                      {formatTime(durationMs)}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-neutral-600 text-lg">Kein Song wird gespielt</p>
            )}
          </div>

          {/* Divider */}
          <div className="h-px bg-neutral-800 mb-6" />

          {/* Queue */}
          <div className="flex-1 min-h-0 flex flex-col">
            <h2 className="text-neutral-500 text-sm font-semibold uppercase tracking-widest mb-4">
              Playlist &mdash; als Nächstes
            </h2>

            {queue.length === 0 ? (
              <p className="text-neutral-600">Keine Songs in der Warteschlange</p>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {queue.map((track, i) => (
                  <div
                    key={`${track.id}-${track.addedAt}`}
                    className="flex items-center gap-4 bg-neutral-900/60 rounded-lg px-4 py-3"
                  >
                    <span className="text-neutral-600 text-sm font-mono w-6 text-right flex-shrink-0">
                      {i + 1}
                    </span>

                    {track.albumArt ? (
                      <img
                        src={track.albumArt}
                        alt={track.name}
                        className="w-10 h-10 rounded-md object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 bg-neutral-800 rounded-md flex-shrink-0" />
                    )}

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{track.name}</p>
                      <p className="text-xs text-neutral-500 truncate">
                        {track.artist}
                      </p>
                    </div>

                    {track.votes > 0 && (
                      <span className="text-xs text-yellow-500 font-semibold flex-shrink-0">
                        {track.votes} Vote{track.votes !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: QR Code */}
        <div className="w-72 lg:w-80 flex-shrink-0 border-l border-neutral-800 flex flex-col items-center justify-center p-6 lg:p-10 gap-6">
          <p className="text-neutral-400 text-center text-sm font-semibold uppercase tracking-widest">
            Song vorschlagen?
          </p>

          {voteUrl ? (
            <>
              <div className="bg-white p-4 rounded-2xl">
                <QRCode
                  value={voteUrl}
                  size={200}
                  bgColor="#ffffff"
                  fgColor="#000000"
                  level="M"
                />
              </div>

              <p className="text-neutral-500 text-xs text-center break-all leading-relaxed max-w-[14rem]">
                {voteUrl}
              </p>
            </>
          ) : (
            <div className="w-[232px] h-[232px] bg-neutral-800 rounded-2xl" />
          )}

          <p className="text-neutral-600 text-xs text-center">
            Scanne den QR-Code, um abzustimmen
          </p>
        </div>
      </div>
    </div>
  );
}
