"use client";

import React, { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
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
  serverTime?: number;
}

/**
 * Maximale Abweichung nach vorne in ms, die wir bei neuem Server-Progress tolerieren,
 * bevor wir die Interpolations-Referenz hart zurücksetzen. Verhindert ewigen Drift,
 * falls lokale Uhr anders läuft oder bei seeks/scrubs.
 */
const PROGRESS_SNAP_TOLERANCE_MS = 2500;

export default function AutoDisplayPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center">
        <p className="text-neutral-500 text-xl">Laden...</p>
      </div>
    }>
      <AutoDisplayContent />
    </Suspense>
  );
}

type LayoutMode = "wide" | "narrow" | "portrait";

/**
 * Wählt das Display-Layout abhängig vom Bildschirm-Seitenverhältnis.
 * - wide (>= 1.5): 16:9 / 16:10 / 21:9 — klassisches Layout mit QR rechts
 * - narrow (1.2 - 1.5): 4:3 / 5:4 — kompakteres zweispaltiges Layout
 * - portrait (< 1.2): Hochkant oder sehr quadratisch — Layout wird gestapelt
 */
function getLayoutMode(width: number, height: number): LayoutMode {
  if (height <= 0) return "wide";
  const ratio = width / height;
  if (ratio < 1.2) return "portrait";
  if (ratio < 1.5) return "narrow";
  return "wide";
}

function AutoDisplayContent() {
  const searchParams = useSearchParams();
  const fixedPartyId = searchParams.get("partyId");
  const [partyId, setPartyId] = useState<string | null>(fixedPartyId);
  const [data, setData] = useState<DisplayData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progressMs, setProgressMs] = useState(0);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("wide");
  const inFlightRef = useRef(false);
  const versionRef = useRef(0);
  const lastTrackIdRef = useRef<string | null>(null);
  const progressStartRef = useRef<{
    wallTime: number;
    trackProgress: number;
  } | null>(null);

  // Layout-Mode anhand der tatsächlichen Fenster-Proportionen bestimmen.
  // Wird bei Resize neu ausgewertet, damit der Display auch auf gedrehten
  // oder umkonfigurierten Monitoren korrekt reagiert.
  useEffect(() => {
    const update = () => {
      setLayoutMode(getLayoutMode(window.innerWidth, window.innerHeight));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

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
      const url = fixedPartyId
        ? `/api/party/display?partyId=${encodeURIComponent(fixedPartyId)}`
        : "/api/party/display";
      const res = await fetch(url, { cache: "no-store" });
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
        // Server liefert progressObservedAt + serverTime. Wir rechnen hoch auf
        // "was wäre der Progress JETZT serverseitig" damit Netzwerk-Latenz und
        // Server-Sync-Lag die Anzeige nicht zurückwerfen.
        const now = Date.now();
        const serverTime = typeof json.serverTime === "number" ? json.serverTime : now;
        const observedAt = typeof ct.progressObservedAt === "number" ? ct.progressObservedAt : serverTime;
        const ageOnServer = Math.max(0, serverTime - observedAt);
        const projectedServerProgress = ct.progressMs + ageOnServer;

        if (trackChanged) {
          // Neuer Track → hart neu starten
          progressStartRef.current = {
            wallTime: now,
            trackProgress: projectedServerProgress,
          };
          setProgressMs(projectedServerProgress);
        } else if (progressStartRef.current) {
          // Gleicher Track → prüfen ob Server-Wert plausibel zu unserer
          // aktuellen Interpolation passt. Wenn der Server-Wert älter/gleich
          // ist als unsere lokale Extrapolation, NICHT zurücksetzen (sonst
          // springt die Timeline zurück, wenn der Server-Sync stockt).
          const localInterpolated =
            progressStartRef.current.trackProgress +
            (now - progressStartRef.current.wallTime);
          const diff = projectedServerProgress - localInterpolated;

          if (diff < -PROGRESS_SNAP_TOLERANCE_MS || diff > PROGRESS_SNAP_TOLERANCE_MS) {
            // Server deutlich abweichend (z.B. manuelles Seek auf Spotify) → snappen
            progressStartRef.current = {
              wallTime: now,
              trackProgress: projectedServerProgress,
            };
            setProgressMs(projectedServerProgress);
          }
          // Sonst: nichts tun, lokale Interpolation weiter laufen lassen
        } else {
          // Noch keine Referenz → erstmalig setzen
          progressStartRef.current = {
            wallTime: now,
            trackProgress: projectedServerProgress,
          };
          setProgressMs(projectedServerProgress);
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
    if (!ct?.isplaying) return;

    // Interval IMMER starten wenn isplaying – progressStartRef kann kurz nach
    // Mount leer sein, wird dann beim nächsten load() befüllt. Early-Return
    // würde den Tick sonst nie starten bis isplaying sich ändert.
    const interval = setInterval(() => {
      const ref = progressStartRef.current;
      if (!ref) return;
      const elapsed = Date.now() - ref.wallTime;
      const next = Math.min(ref.trackProgress + elapsed, ct.durationMs ?? 0);
      setProgressMs(next);
    }, 500);

    return () => clearInterval(interval);
  }, [data?.currentTrack?.id, data?.currentTrack?.isplaying, data?.currentTrack?.durationMs]);

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

  // Layout-abhängige Klassen.
  // 4:3 / 5:4-Monitore (narrow) bekommen kompaktere Abstände, kleinere
  // Albumart und eine schmalere QR-Spalte, damit die QR-Säule nicht fast
  // ein Drittel der Breite frisst.
  const isNarrow = layoutMode === "narrow";
  const isPortrait = layoutMode === "portrait";

  const mainPadding = isPortrait
    ? "p-4"
    : isNarrow
    ? "p-4 lg:p-6"
    : "p-6 lg:p-10";

  const nowPlayingMargin = isNarrow || isPortrait ? "mb-3" : "mb-8";

  // Für narrow (4:3) und portrait: fluide Größen via clamp() mit vh-Units,
  // damit es auf 800×600 genauso "richtig" aussieht wie auf 2048×1536 —
  // ohne harte Tailwind-Breakpoints, die immer nur auf einzelne Größen passen.
  const compactSizing = isNarrow || isPortrait;

  const albumArtClass = compactSizing
    ? "rounded-xl object-cover shadow-2xl shadow-black/50 flex-shrink-0"
    : "w-32 h-32 lg:w-44 lg:h-44 rounded-xl object-cover shadow-2xl shadow-black/50 flex-shrink-0";
  const albumArtStyle: React.CSSProperties | undefined = compactSizing
    ? { width: "clamp(64px, 12vh, 128px)", height: "clamp(64px, 12vh, 128px)" }
    : undefined;

  const titleClass = compactSizing
    ? "font-bold truncate leading-tight"
    : "text-2xl lg:text-4xl font-bold truncate";
  const titleStyle: React.CSSProperties | undefined = compactSizing
    ? { fontSize: "clamp(1rem, 2.6vh, 1.75rem)" }
    : undefined;

  const artistClass = compactSizing
    ? "text-neutral-400 truncate leading-tight"
    : "text-lg lg:text-xl text-neutral-400 truncate mt-1";
  const artistStyle: React.CSSProperties | undefined = compactSizing
    ? { fontSize: "clamp(0.8rem, 1.8vh, 1.1rem)", marginTop: "0.15rem" }
    : undefined;

  const qrColumnClass = isPortrait
    ? "w-full flex-shrink-0 border-t border-neutral-800 flex flex-col sm:flex-row items-center justify-center p-4 gap-4"
    : isNarrow
    ? "w-56 lg:w-60 flex-shrink-0 border-l border-neutral-800 flex flex-col items-center justify-center p-4 lg:p-6 gap-4"
    : "w-72 lg:w-80 flex-shrink-0 border-l border-neutral-800 flex flex-col items-center justify-center p-6 lg:p-10 gap-6";

  const qrSize = isPortrait ? 140 : isNarrow ? 160 : 200;
  const qrCanvasWidthClass = isPortrait
    ? "w-[172px] h-[172px]"
    : isNarrow
    ? "w-[192px] h-[192px]"
    : "w-[232px] h-[232px]";

  // Auf Portrait-Aspect wandert der QR unter den Content; sonst daneben.
  const mainContentDirection = isPortrait ? "flex-col" : "flex-row";

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col overflow-hidden select-none">
      {/* Error banner */}
      {error && (
        <div className="bg-red-900/60 text-red-200 text-center py-2 text-sm">
          {error}
        </div>
      )}

      {/* Main content: layout abhängig von Aspect-Ratio */}
      <div className={`flex-1 flex min-h-0 ${mainContentDirection}`}>
        {/* Left: Now Playing + Queue */}
        <div className={`flex-1 flex flex-col ${mainPadding} min-w-0`}>
          {/* Now Playing */}
          <div className={nowPlayingMargin}>
            <h2 className="text-neutral-500 text-sm font-semibold uppercase tracking-widest mb-4">
              Aktueller Song
            </h2>

            {ct ? (
              <div className={`flex items-center ${compactSizing ? "gap-4" : "gap-6"}`}>
                {ct.albumArt ? (
                  <img
                    src={ct.albumArt}
                    alt={ct.name}
                    className={albumArtClass}
                    style={albumArtStyle}
                  />
                ) : (
                  <div className={`${albumArtClass} bg-neutral-800`} style={albumArtStyle} />
                )}

                <div className="min-w-0 flex-1">
                  <p className={titleClass} style={titleStyle}>
                    {ct.name}
                  </p>
                  <p className={artistClass} style={artistStyle}>
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
          <div className={`h-px bg-neutral-800 ${isNarrow || isPortrait ? "mb-3" : "mb-6"}`} />

          {/* Queue */}
          <div className="flex-1 min-h-0 flex flex-col">
            <h2 className={`text-neutral-500 text-sm font-semibold uppercase tracking-widest ${isNarrow || isPortrait ? "mb-2" : "mb-4"}`}>
              Playlist &mdash; als Nächstes
            </h2>

            {queue.length === 0 ? (
              <p className="text-neutral-600">Keine Songs in der Warteschlange</p>
            ) : compactSizing ? (
              // 4:3 / Portrait: Items teilen sich den Platz via flex: 1 1 0,
              // alle 10 passen garantiert rein — unabhängig von der Auflösung.
              // Albumart + Text werden fluide über clamp()/% der Item-Höhe skaliert.
              <div
                className="flex-1 min-h-0 flex flex-col overflow-hidden"
                style={{ gap: "clamp(2px, 0.6vh, 8px)" }}
              >
                {queue.map((track, i) => (
                  <div
                    key={`${track.id}-${track.addedAt}`}
                    className="flex items-center bg-neutral-900/60 rounded-lg min-h-0 overflow-hidden"
                    style={{
                      flex: "1 1 0",
                      gap: "clamp(6px, 1vw, 16px)",
                      padding: "clamp(4px, 0.8vh, 10px) clamp(8px, 1vw, 16px)",
                    }}
                  >
                    <span
                      className="text-neutral-600 font-mono text-right flex-shrink-0"
                      style={{
                        fontSize: "clamp(0.7rem, 1.5vh, 1rem)",
                        width: "clamp(1rem, 2vw, 1.75rem)",
                      }}
                    >
                      {i + 1}
                    </span>

                    {track.albumArt ? (
                      <img
                        src={track.albumArt}
                        alt={track.name}
                        className="rounded-md object-cover flex-shrink-0 aspect-square"
                        style={{ height: "80%" }}
                      />
                    ) : (
                      <div
                        className="bg-neutral-800 rounded-md flex-shrink-0 aspect-square"
                        style={{ height: "80%" }}
                      />
                    )}

                    <div className="flex-1 min-w-0">
                      <p
                        className="font-medium truncate leading-tight"
                        style={{ fontSize: "clamp(0.75rem, 1.7vh, 1.1rem)" }}
                      >
                        {track.name}
                      </p>
                      <p
                        className="text-neutral-500 truncate leading-tight"
                        style={{ fontSize: "clamp(0.65rem, 1.3vh, 0.9rem)" }}
                      >
                        {track.artist}
                      </p>
                    </div>

                    {track.votes > 0 && (
                      <span
                        className="text-yellow-500 font-semibold flex-shrink-0"
                        style={{ fontSize: "clamp(0.65rem, 1.3vh, 0.9rem)" }}
                      >
                        {track.votes} Vote{track.votes !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              // Wide (16:9): klassisches scroll-fähiges Layout, wie bisher.
              <div className="flex-1 overflow-y-auto pr-1 space-y-2">
                {queue.map((track, i) => (
                  <div
                    key={`${track.id}-${track.addedAt}`}
                    className="flex items-center bg-neutral-900/60 rounded-lg gap-4 px-4 py-3"
                  >
                    <span className="text-neutral-600 font-mono text-right flex-shrink-0 text-sm w-6">
                      {i + 1}
                    </span>

                    {track.albumArt ? (
                      <img
                        src={track.albumArt}
                        alt={track.name}
                        className="rounded-md object-cover flex-shrink-0 w-10 h-10"
                      />
                    ) : (
                      <div className="bg-neutral-800 rounded-md flex-shrink-0 w-10 h-10" />
                    )}

                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate leading-tight text-sm">{track.name}</p>
                      <p className="text-neutral-500 truncate leading-tight text-xs">
                        {track.artist}
                      </p>
                    </div>

                    {track.votes > 0 && (
                      <span className="text-yellow-500 font-semibold flex-shrink-0 text-xs">
                        {track.votes} Vote{track.votes !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right (oder unten bei portrait): QR Code */}
        <div className={qrColumnClass}>
          <p className="text-neutral-400 text-center text-sm font-semibold uppercase tracking-widest">
            Song vorschlagen?
          </p>

          {voteUrl ? (
            <>
              <div className="bg-white p-4 rounded-2xl">
                <QRCode
                  value={voteUrl}
                  size={qrSize}
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
            <div className={`${qrCanvasWidthClass} bg-neutral-800 rounded-2xl`} />
          )}

          <p className="text-neutral-600 text-xs text-center">
            Scanne den QR-Code, um abzustimmen
          </p>
        </div>
      </div>
    </div>
  );
}
