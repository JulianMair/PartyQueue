"use client";

import { useEffect, useRef, useState, use } from "react";
import { PartyTrack } from "@/app/lib/providers/types";

/* -------------------------------------------------------------------------- */
/*                         TICKER / MARQUEE COMPONENT                         */
/* -------------------------------------------------------------------------- */

function Ticker({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setScroll(el.scrollWidth > el.clientWidth + 1);
    const id = requestAnimationFrame(check);
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => { cancelAnimationFrame(id); ro.disconnect(); };
  }, [text]);

  return (
    <div ref={ref} className={`overflow-hidden whitespace-nowrap ${className}`}>
      {scroll ? (
        <span className="inline-flex ticker-scroll">
          <span className="pr-8">{text}</span>
          <span aria-hidden className="pr-8">{text}</span>
        </span>
      ) : text}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                         CLIENT ID HANDLING (SAFE)                           */
/* -------------------------------------------------------------------------- */

function getClientId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    let id = localStorage.getItem("party_client_id");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("party_client_id", id);
    }
    return id;
  }

  const fallbackUUID = () =>
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : ((r & 0x3) | 0x8);
      return v.toString(16);
    });

  let id = localStorage.getItem("party_client_id");
  if (!id) {
    id = fallbackUUID();
    localStorage.setItem("party_client_id", id);
  }
  return id;
}

/* -------------------------------------------------------------------------- */
/*                      FRONTEND LOCAL VOTE TRACKING                           */
/* -------------------------------------------------------------------------- */

function markVoted(partyId: string, trackId: string) {
  localStorage.setItem(`vote_${partyId}_${trackId}`, "1");
}

function unmarkVoted(partyId: string, trackId: string) {
  localStorage.removeItem(`vote_${partyId}_${trackId}`);
}

function loadVotedSet(partyId: string, tracks: PartyTrack[]) {
  const voted = new Set<string>();
  for (const track of tracks) {
    if (localStorage.getItem(`vote_${partyId}_${track.id}`) === "1") {
      voted.add(track.id);
    }
  }
  return voted;
}

function getTop10Signature(top10: PartyTrack[]) {
  return top10
    .map((track) => `${track.id}:${track.votes}:${track.addedAt}`)
    .join("|");
}

function trackShouldComeBefore(a: PartyTrack, b: PartyTrack) {
  return a.votes > b.votes || (a.votes === b.votes && a.addedAt < b.addedAt);
}

function applyLocalVoteDelta(
  previous: PartyTrack[],
  trackId: string,
  delta: 1 | -1
) {
  const index = previous.findIndex((song) => song.id === trackId);
  if (index < 0) return previous;

  const next = previous.map((song, i) =>
    i === index ? { ...song, votes: Math.max(0, song.votes + delta) } : song
  );

  let current = index;

  if (delta > 0) {
    while (
      current > 0 &&
      trackShouldComeBefore(next[current], next[current - 1])
    ) {
      const tmp = next[current - 1];
      next[current - 1] = next[current];
      next[current] = tmp;
      current -= 1;
    }
  } else {
    while (
      current < next.length - 1 &&
      trackShouldComeBefore(next[current + 1], next[current])
    ) {
      const tmp = next[current + 1];
      next[current + 1] = next[current];
      next[current] = tmp;
      current += 1;
    }
  }

  return next;
}

/* -------------------------------------------------------------------------- */
/*                               PAGE COMPONENT                                */
/* -------------------------------------------------------------------------- */

export default function MobileVotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: partyId } = use(params);

  const [songs, setSongs] = useState<PartyTrack[]>([]);
  const [currentTrack, setCurrentTrack] = useState<PartyTrack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [votedTrackIds, setVotedTrackIds] = useState<Set<string>>(new Set());
  const [pendingVoteTrackIds, setPendingVoteTrackIds] = useState<Set<string>>(new Set());
  const inFlightRef = useRef(false);
  const top10SignatureRef = useRef("");
  const versionRef = useRef(0);

  const buildSpotifyLink = (track: PartyTrack) => {
    if (track.id) {
      return `https://open.spotify.com/track/${encodeURIComponent(track.id)}`;
    }
    if (track.uri && track.uri.startsWith("spotify:track:")) {
      const trackId = track.uri.split(":")[2];
      if (trackId) {
        return `https://open.spotify.com/track/${encodeURIComponent(trackId)}`;
      }
    }
    return null;
  };

  /* -------------------------------------------------------------------------- */
  /*                            LOAD TOP 10 SONGS                               */
  /* -------------------------------------------------------------------------- */

  const load = async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const res = await fetch(`/api/party/mobile?partyId=${partyId}`, {
        cache: "no-store",
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Fehler beim Laden");
        return;
      }

      setError(null);
      const top10 = Array.isArray(data.top10) ? (data.top10 as PartyTrack[]) : [];
      const nextSignature = getTop10Signature(top10);
      if (nextSignature !== top10SignatureRef.current) {
        top10SignatureRef.current = nextSignature;
        setSongs(top10);
        setVotedTrackIds(loadVotedSet(partyId, top10));
      }

      if (data.currentTrack) {
        setCurrentTrack(data.currentTrack as PartyTrack);
      } else {
        setCurrentTrack(null);
      }

      if (typeof data.version === "number") {
        versionRef.current = data.version;
      }
    } catch (e) {
      console.error("[Mobile] Fehler beim Laden:", e);
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
      const nextDelay = document.hidden ? 3500 : 1500;
      timer = setTimeout(run, nextDelay);
    };

    void run();

    const onVisibilityChange = () => {
      if (isCancelled) return;
      if (!document.hidden) {
        void load();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      isCancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [partyId]);

  /* -------------------------------------------------------------------------- */
  /*                                   VOTING                                   */
  /* -------------------------------------------------------------------------- */

  const vote = async (trackId: string) => {
    if (pendingVoteTrackIds.has(trackId)) return;

    const clientId = getClientId();
    const previousSongs = songs;
    const wasVoted = votedTrackIds.has(trackId);
    const action: "vote" | "unvote" = wasVoted ? "unvote" : "vote";

    setPendingVoteTrackIds((prev) => {
      const next = new Set(prev);
      next.add(trackId);
      return next;
    });

    const optimistic = applyLocalVoteDelta(previousSongs, trackId, wasVoted ? -1 : 1);
    setSongs(optimistic);
    top10SignatureRef.current = getTop10Signature(optimistic);
    setVotedTrackIds((prev) => {
      const next = new Set(prev);
      if (wasVoted) next.delete(trackId);
      else next.add(trackId);
      return next;
    });

    try {
      const res = await fetch("/api/party/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partyId, trackId, clientId, action }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.status === "not_found") {
        setSongs(previousSongs);
        top10SignatureRef.current = getTop10Signature(previousSongs);
        setVotedTrackIds((prev) => {
          const next = new Set(prev);
          if (wasVoted) next.add(trackId);
          else next.delete(trackId);
          return next;
        });
        return;
      }

      if (data.status === "ok" || data.status === "duplicate") {
        markVoted(partyId, trackId);
        setVotedTrackIds((prev) => {
          const next = new Set(prev);
          next.add(trackId);
          return next;
        });
      }

      if (data.status === "removed" || data.status === "not_voted") {
        unmarkVoted(partyId, trackId);
        setVotedTrackIds((prev) => {
          const next = new Set(prev);
          next.delete(trackId);
          return next;
        });
      }

      if (Array.isArray(data.top10)) {
        const serverTop10 = data.top10 as PartyTrack[];
        const nextSignature = getTop10Signature(serverTop10);
        if (nextSignature !== top10SignatureRef.current) {
          top10SignatureRef.current = nextSignature;
          setSongs(serverTop10);
        }
      }

      if (typeof data.version === "number") {
        versionRef.current = data.version;
      }
    } catch {
      setSongs(previousSongs);
      top10SignatureRef.current = getTop10Signature(previousSongs);
      setVotedTrackIds((prev) => {
        const next = new Set(prev);
        if (wasVoted) next.add(trackId);
        else next.delete(trackId);
        return next;
      });
    } finally {
      setPendingVoteTrackIds((prev) => {
        const next = new Set(prev);
        next.delete(trackId);
        return next;
      });
    }
  };

  /* -------------------------------------------------------------------------- */
  /*                                   UI                                       */
  /* -------------------------------------------------------------------------- */

  return (
    <>
      <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
      <meta name="theme-color" content="#0a0a0a" />

      <div className="h-[100dvh] bg-neutral-950 text-white flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 text-center">
          <h1 className="text-lg font-bold tracking-tight">Party Voting</h1>
        </div>

        {error && (
          <div className="mx-4 mb-2 px-3 py-1.5 bg-red-900/30 border border-red-800/40 rounded-lg">
            <p className="text-center text-red-400 text-xs">{error}</p>
          </div>
        )}

        {/* Song List */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
          {songs.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center h-full text-neutral-500">
              <p className="text-base">Keine Songs in der Queue</p>
              <p className="text-xs mt-1">Warte auf den Host...</p>
            </div>
          )}

          <div className="space-y-1.5">
            {songs.map((s, i) => {
              const voted = votedTrackIds.has(s.id);
              const pending = pendingVoteTrackIds.has(s.id);
              const spotifyLink = buildSpotifyLink(s);

              return (
                <div
                  key={`${s.id}-${s.addedAt}`}
                  className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-colors ${
                    voted
                      ? "bg-green-950/40 border border-green-800/30"
                      : "bg-neutral-900/70 border border-neutral-800/50"
                  }`}
                >
                  {/* Cover + rank badge */}
                  <div className="relative flex-shrink-0">
                    {s.albumArt ? (
                      <img
                        src={s.albumArt}
                        alt={s.name}
                        className="w-11 h-11 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="w-11 h-11 bg-neutral-800 rounded-lg" />
                    )}
                    <span className="absolute -top-1 -left-1 bg-neutral-800 border border-neutral-700 text-[10px] font-bold text-neutral-300 w-5 h-5 rounded-full flex items-center justify-center">
                      {i + 1}
                    </span>
                  </div>

                  {/* Song Info */}
                  <div className="flex-1 min-w-0">
                    <Ticker text={s.name} className="text-sm font-medium text-white leading-tight" />
                    <Ticker text={s.artist} className="text-xs text-neutral-400 leading-tight mt-0.5" />
                  </div>

                  {/* Spotify link */}
                  {spotifyLink && (
                    <a
                      href={spotifyLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-neutral-800 active:bg-neutral-700"
                      aria-label="Auf Spotify anhören"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="#1DB954">
                        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                      </svg>
                    </a>
                  )}

                  {/* Vote Button */}
                  <button
                    disabled={pending}
                    onClick={() => vote(s.id)}
                    className={`flex-shrink-0 flex flex-col items-center justify-center w-11 h-11 rounded-xl font-semibold transition-transform active:scale-90 ${
                      pending
                        ? "bg-neutral-800 text-neutral-600"
                        : voted
                        ? "bg-green-500 text-white"
                        : "bg-white/10 text-white active:bg-white/20"
                    }`}
                  >
                    {pending ? (
                      <span className="block w-4 h-4 border-2 border-neutral-600 border-t-neutral-400 rounded-full animate-spin" />
                    ) : (
                      <>
                        <span className="text-base leading-none">👍</span>
                        <span className={`text-[10px] font-bold leading-none mt-0.5 ${voted ? "text-white" : "text-neutral-400"}`}>{s.votes}</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Now Playing Footer */}
        {currentTrack && (
          <div className="fixed bottom-0 left-0 right-0">
            <div className="mx-2 mb-[max(0.5rem,env(safe-area-inset-bottom))] bg-neutral-900/95 backdrop-blur-xl border border-neutral-800/60 rounded-2xl px-3 py-2.5 shadow-2xl shadow-black/50">
              <div className="flex items-center gap-3">
                {currentTrack.albumArt ? (
                  <img
                    src={currentTrack.albumArt}
                    alt={currentTrack.name}
                    className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 bg-neutral-800 rounded-lg flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <Ticker text={currentTrack.name} className="text-[13px] font-semibold text-white leading-tight" />
                  <Ticker text={currentTrack.artist} className="text-[11px] text-neutral-400 leading-tight" />
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                  </span>
                  <span className="text-[11px] text-green-500 font-medium">Live</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
