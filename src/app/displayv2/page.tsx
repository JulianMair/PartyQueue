"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import QRCode from "react-qr-code";
import type { PartyTrack } from "@/app/lib/providers/types";

const POLL_INTERVAL_MS = 3000;
const POLL_INTERVAL_HIDDEN_MS = 6000;

interface DisplayV2Data {
  partyId: string;
  name: string;
  version: number;
  isActive: boolean;
  queue: PartyTrack[];
  serverTime?: number;
}

export default function DisplayV2Page() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center">
          <p className="text-neutral-500 text-2xl">Laden...</p>
        </div>
      }
    >
      <DisplayV2Content />
    </Suspense>
  );
}

/**
 * Auf Breitbild (16:9 / 16:10 / 21:9) ist die Höhe der Engpass: 10 Zeilen
 * untereinander bleiben zwangsläufig klein, während seitlich Platz frei liegt.
 * Deshalb dort zweispaltig (1-5 / 6-10) — jede Zeile wird doppelt so hoch und
 * damit aus der Ferne deutlich besser lesbar. Schmalere Formate bleiben
 * einspaltig, da fehlt die Breite für zwei Spalten.
 */
function isWideRatio(width: number, height: number) {
  if (height <= 0) return true;
  return width / height >= 1.5;
}

function DisplayV2Content() {
  const searchParams = useSearchParams();
  const fixedPartyId = searchParams.get("partyId");
  const [partyId, setPartyId] = useState<string | null>(fixedPartyId);
  const [data, setData] = useState<DisplayV2Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isWide, setIsWide] = useState(true);
  const inFlightRef = useRef(false);
  const versionRef = useRef(0);

  useEffect(() => {
    const update = () => setIsWide(isWideRatio(window.innerWidth, window.innerHeight));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  /* ------------------------------------------------------------------ */
  /*  Polling – ohne partyId löst die API die aktive Party selbst auf   */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      if (stopped || inFlightRef.current) {
        schedule();
        return;
      }
      inFlightRef.current = true;
      try {
        const url = partyId
          ? `/api/party/displayv2?partyId=${encodeURIComponent(partyId)}`
          : "/api/party/displayv2";
        const res = await fetch(url, { cache: "no-store" });
        const json = await res.json();

        if (!res.ok) {
          setError(json.error || "Keine aktive Party");
          setData(null);
          setPartyId(json.partyId ?? null);
        } else {
          setError(null);
          const nextPartyId = json.partyId as string;
          const nextVersion = json.version ?? 0;
          if (nextPartyId !== partyId) setPartyId(nextPartyId);
          if (nextVersion !== versionRef.current || !data) {
            versionRef.current = nextVersion;
            setData(json as DisplayV2Data);
          }
        }
      } catch {
        // Netzwerk-Hickup — beim nächsten Tick erneut versuchen
      } finally {
        inFlightRef.current = false;
        schedule();
      }
    };

    const schedule = () => {
      if (stopped) return;
      const hidden =
        typeof document !== "undefined" && document.visibilityState === "hidden";
      timer = setTimeout(poll, hidden ? POLL_INTERVAL_HIDDEN_MS : POLL_INTERVAL_MS);
    };

    poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partyId]);

  const baseUrl =
    typeof window !== "undefined"
      ? `${window.location.protocol}//${window.location.host}`
      : "";
  const voteUrl = partyId ? `${baseUrl}/party/${partyId}/vote` : "";

  /* ------------------------------------------------------------------ */
  /*  Render                                                            */
  /* ------------------------------------------------------------------ */
  if (!data && !error) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center">
        <p className="text-neutral-500 text-2xl">Verbinde mit Party...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center">
        <p className="text-neutral-500 text-2xl">{error}</p>
      </div>
    );
  }

  const queue = data?.queue ?? [];
  const maxVotes = queue.reduce((m, t) => Math.max(m, t.votes ?? 0), 0);

  // Zwei Spalten nur wenn Breitbild UND genug Songs — sonst bliebe rechts Leere.
  const twoColumns = isWide && queue.length > 5;
  const splitAt = twoColumns ? Math.ceil(queue.length / 2) : queue.length;
  const columns = twoColumns
    ? [
        { items: queue.slice(0, splitAt), offset: 0 },
        { items: queue.slice(splitAt), offset: splitAt },
      ]
    : [{ items: queue, offset: 0 }];

  // Bei 5 Zeilen pro Spalte ist jede Zeile doppelt so hoch wie bei 10 —
  // die Typo darf entsprechend größer skalieren.
  const rowCount = twoColumns ? splitAt : Math.max(1, queue.length);
  const big = rowCount <= 6;

  const rankSize = big ? "clamp(1.5rem, 6vh, 5rem)" : "clamp(1.1rem, 3.6vh, 2.5rem)";
  const titleSize = big ? "clamp(1.1rem, 4.2vh, 3.25rem)" : "clamp(0.9rem, 2.6vh, 1.9rem)";
  const artistSize = big ? "clamp(0.85rem, 2.4vh, 1.9rem)" : "clamp(0.7rem, 1.7vh, 1.15rem)";
  const voteSize = big ? "clamp(1.5rem, 6vh, 5rem)" : "clamp(1.1rem, 3.6vh, 2.5rem)";
  const voteLabelSize = big ? "clamp(0.6rem, 1.3vh, 1.05rem)" : "clamp(0.5rem, 1vh, 0.8rem)";

  const renderRow = (track: PartyTrack, rank: number) => {
    const isLeader = track.votes > 0 && track.votes === maxVotes;
    return (
      <div
        key={`${track.id}-${track.addedAt}`}
        className={`flex items-center rounded-2xl min-h-0 overflow-hidden border ${
          isLeader
            ? "bg-yellow-500/10 border-yellow-500/40"
            : "bg-neutral-900/70 border-neutral-800/60"
        }`}
        style={{
          flex: "1 1 0",
          gap: "clamp(0.6rem, 1.4vw, 1.75rem)",
          padding: "clamp(0.35rem, 1vh, 1rem) clamp(0.6rem, 1.4vw, 1.5rem)",
        }}
      >
        <span
          className={`font-bold font-mono text-center flex-shrink-0 tabular-nums ${
            isLeader ? "text-yellow-500" : "text-neutral-600"
          }`}
          style={{ fontSize: rankSize, width: "clamp(1.5rem, 3.5vw, 4.5rem)" }}
        >
          {rank}
        </span>

        {track.albumArt ? (
          <img
            src={track.albumArt}
            alt={track.name}
            className="rounded-lg object-cover flex-shrink-0 aspect-square"
            style={{ height: "80%" }}
          />
        ) : (
          <div
            className="bg-neutral-800 rounded-lg flex-shrink-0 aspect-square"
            style={{ height: "80%" }}
          />
        )}

        <div className="flex-1 min-w-0">
          <p className="font-bold truncate leading-tight" style={{ fontSize: titleSize }}>
            {track.name}
          </p>
          <p
            className="text-neutral-400 truncate leading-tight"
            style={{ fontSize: artistSize, marginTop: "0.1rem" }}
          >
            {track.artist}
          </p>
        </div>

        <div className="flex-shrink-0 flex flex-col items-center justify-center leading-none">
          <span
            className={`font-extrabold tabular-nums ${
              isLeader ? "text-yellow-500" : "text-white"
            }`}
            style={{ fontSize: voteSize }}
          >
            {track.votes ?? 0}
          </span>
          <span
            className="text-neutral-500 uppercase tracking-wider"
            style={{ fontSize: voteLabelSize }}
          >
            {track.votes === 1 ? "Vote" : "Votes"}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="h-screen bg-neutral-950 text-white flex flex-col overflow-hidden select-none">
      {error && (
        <div className="bg-red-900/60 text-red-200 text-center py-2 text-sm">{error}</div>
      )}

      <div className={`flex-1 min-h-0 flex ${isWide ? "flex-row" : "flex-col"}`}>
        {/* Songs */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div
            className="flex-shrink-0"
            style={{ padding: "clamp(0.6rem, 1.8vh, 1.75rem) clamp(1rem, 2.5vw, 2.5rem) 0" }}
          >
            <p
              className="text-neutral-500 font-semibold uppercase tracking-widest leading-tight"
              style={{ fontSize: "clamp(0.65rem, 1.3vh, 1.1rem)" }}
            >
              Top 10 &mdash; Voting
            </p>
            <h1
              className="font-bold truncate leading-tight"
              style={{ fontSize: "clamp(1.25rem, 4.2vh, 3.5rem)" }}
            >
              {data?.name}
            </h1>
          </div>

          {queue.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-neutral-600" style={{ fontSize: "clamp(1rem, 3vh, 2rem)" }}>
                Noch keine Songs in der Voting-Liste
              </p>
            </div>
          ) : (
            <div
              className="flex-1 min-h-0 flex"
              style={{
                gap: "clamp(0.5rem, 1.4vw, 1.5rem)",
                padding: "clamp(0.5rem, 1.5vh, 1.5rem) clamp(1rem, 2.5vw, 2.5rem)",
              }}
            >
              {columns.map((col, ci) => (
                <div
                  key={ci}
                  className="flex-1 min-w-0 min-h-0 flex flex-col"
                  style={{ gap: "clamp(4px, 1vh, 14px)" }}
                >
                  {col.items.map((track, i) => renderRow(track, col.offset + i + 1))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* QR: eigene Spalte auf Breitbild, sonst Leiste unten */}
        {voteUrl && (
          <div
            className={`flex-shrink-0 flex items-center justify-center ${
              isWide
                ? "flex-col border-l border-neutral-800"
                : "flex-row border-t border-neutral-800"
            }`}
            style={{
              gap: "clamp(0.5rem, 1.5vh, 1.25rem)",
              padding: "clamp(0.75rem, 2vh, 2rem) clamp(1rem, 1.5vw, 2rem)",
              width: isWide ? "clamp(210px, 24vw, 460px)" : undefined,
            }}
          >
            <p
              className="text-neutral-300 font-semibold uppercase tracking-widest text-center leading-tight"
              style={{ fontSize: "clamp(0.7rem, 1.8vh, 1.5rem)" }}
            >
              Jetzt mitvoten
            </p>

            <div
              className="bg-white rounded-2xl"
              style={{ padding: "clamp(0.5rem, 1.2vh, 1.25rem)" }}
            >
              <QRCode
                value={voteUrl}
                size={512}
                bgColor="#ffffff"
                fgColor="#000000"
                level="M"
                style={{
                  display: "block",
                  width: isWide ? "clamp(150px, 19vw, 380px)" : "clamp(110px, 17vh, 260px)",
                  height: isWide ? "clamp(150px, 19vw, 380px)" : "clamp(110px, 17vh, 260px)",
                }}
              />
            </div>

            <p
              className="text-neutral-500 text-center break-all leading-snug"
              style={{ fontSize: "clamp(0.6rem, 1.2vh, 1rem)" }}
            >
              {voteUrl}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
