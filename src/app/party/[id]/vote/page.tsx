"use client";

import { useEffect, useRef, useState, useCallback, use } from "react";
import { PartyTrack } from "@/app/lib/providers/types";
import type { Track } from "@/app/lib/providers/types";
import type { SuggestionJSON } from "@/app/lib/party/PartyManager";

/* ── Ticker ──────────────────────────────────────────────────────────────── */

function Ticker({ text, className = "" }: { text: string; className?: string }) {
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

/* ── Client ID ───────────────────────────────────────────────────────────── */

function getClientId(): string {
  let id = localStorage.getItem("party_client_id");
  if (id) return id;
  id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });
  localStorage.setItem("party_client_id", id);
  return id;
}

/* ── Vote tracking ───────────────────────────────────────────────────────── */

function markVoted(partyId: string, trackId: string) { localStorage.setItem(`vote_${partyId}_${trackId}`, "1"); }
function unmarkVoted(partyId: string, trackId: string) { localStorage.removeItem(`vote_${partyId}_${trackId}`); }
function loadVotedSet(partyId: string, tracks: PartyTrack[]) {
  const voted = new Set<string>();
  for (const t of tracks) if (localStorage.getItem(`vote_${partyId}_${t.id}`) === "1") voted.add(t.id);
  return voted;
}

function getTop10Signature(top10: PartyTrack[]) {
  return top10.map((t) => `${t.id}:${t.votes}:${t.addedAt}`).join("|");
}
function trackShouldComeBefore(a: PartyTrack, b: PartyTrack) {
  return a.votes > b.votes || (a.votes === b.votes && a.addedAt < b.addedAt);
}
function applyLocalVoteDelta(previous: PartyTrack[], trackId: string, delta: 1 | -1) {
  const idx = previous.findIndex((s) => s.id === trackId);
  if (idx < 0) return previous;
  const next = previous.map((s, i) => i === idx ? { ...s, votes: Math.max(0, s.votes + delta) } : s);
  let cur = idx;
  if (delta > 0) {
    while (cur > 0 && trackShouldComeBefore(next[cur], next[cur - 1])) { [next[cur - 1], next[cur]] = [next[cur], next[cur - 1]]; cur--; }
  } else {
    while (cur < next.length - 1 && trackShouldComeBefore(next[cur + 1], next[cur])) { [next[cur + 1], next[cur]] = [next[cur], next[cur + 1]]; cur++; }
  }
  return next;
}

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function MobileVotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: partyId } = use(params);

  // Queue state
  const [songs, setSongs] = useState<PartyTrack[]>([]);
  const [currentTrack, setCurrentTrack] = useState<PartyTrack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [votedTrackIds, setVotedTrackIds] = useState<Set<string>>(new Set());
  const [pendingVoteTrackIds, setPendingVoteTrackIds] = useState<Set<string>>(new Set());
  const inFlightRef = useRef(false);
  const top10SignatureRef = useRef("");
  const versionRef = useRef(0);

  // Suggestion state
  const [suggestions, setSuggestions] = useState<SuggestionJSON[]>([]);
  const [suggestionsEnabled, setSuggestionsEnabled] = useState(false);
  const [suggestionThreshold, setSuggestionThreshold] = useState(3);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [suggestPending, setSuggestPending] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clientId = useRef<string>("");
  useEffect(() => { clientId.current = getClientId(); }, []);

  const buildSpotifyLink = useCallback((track: { id?: string; uri?: string }) => {
    if (track.id) return `https://open.spotify.com/track/${encodeURIComponent(track.id)}`;
    if (track.uri?.startsWith("spotify:track:")) {
      const tid = track.uri.split(":")[2];
      if (tid) return `https://open.spotify.com/track/${encodeURIComponent(tid)}`;
    }
    return null;
  }, []);

  /* ── Polling ─────────────────────────────────────────────────────────── */

  const load = async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const res = await fetch(`/api/party/mobile?partyId=${partyId}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Fehler"); return; }
      setError(null);

      const top10 = Array.isArray(data.top10) ? (data.top10 as PartyTrack[]) : [];
      const sig = getTop10Signature(top10);
      if (sig !== top10SignatureRef.current) {
        top10SignatureRef.current = sig;
        setSongs(top10);
        setVotedTrackIds(loadVotedSet(partyId, top10));
      }
      if (data.currentTrack) setCurrentTrack(data.currentTrack);
      else setCurrentTrack(null);
      if (typeof data.version === "number") versionRef.current = data.version;

      // Suggestions
      setSuggestionsEnabled(data.suggestionsEnabled === true);
      if (Array.isArray(data.suggestions)) setSuggestions(data.suggestions);
      if (typeof data.suggestionThreshold === "number") setSuggestionThreshold(data.suggestionThreshold);
    } catch { setError("Netzwerkfehler"); } finally { inFlightRef.current = false; }
  };

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const run = async () => { if (cancelled) return; await load(); if (cancelled) return; timer = setTimeout(run, document.hidden ? 3500 : 1500); };
    void run();
    const onVis = () => { if (!cancelled && !document.hidden) void load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { cancelled = true; if (timer) clearTimeout(timer); document.removeEventListener("visibilitychange", onVis); };
  }, [partyId]);

  /* ── Queue Voting ────────────────────────────────────────────────────── */

  const vote = async (trackId: string) => {
    if (pendingVoteTrackIds.has(trackId)) return;
    const cid = clientId.current || getClientId();
    const prev = songs;
    const wasVoted = votedTrackIds.has(trackId);
    const action: "vote" | "unvote" = wasVoted ? "unvote" : "vote";

    setPendingVoteTrackIds((p) => new Set(p).add(trackId));
    const optimistic = applyLocalVoteDelta(prev, trackId, wasVoted ? -1 : 1);
    setSongs(optimistic);
    top10SignatureRef.current = getTop10Signature(optimistic);
    setVotedTrackIds((p) => { const n = new Set(p); wasVoted ? n.delete(trackId) : n.add(trackId); return n; });

    try {
      const res = await fetch("/api/party/vote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ partyId, trackId, clientId: cid, action }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.status === "not_found") {
        setSongs(prev); top10SignatureRef.current = getTop10Signature(prev);
        setVotedTrackIds((p) => { const n = new Set(p); wasVoted ? n.add(trackId) : n.delete(trackId); return n; });
        return;
      }
      if (data.status === "ok" || data.status === "duplicate") { markVoted(partyId, trackId); setVotedTrackIds((p) => new Set(p).add(trackId)); }
      if (data.status === "removed" || data.status === "not_voted") { unmarkVoted(partyId, trackId); setVotedTrackIds((p) => { const n = new Set(p); n.delete(trackId); return n; }); }
      if (Array.isArray(data.top10)) { const st = data.top10 as PartyTrack[]; const ns = getTop10Signature(st); if (ns !== top10SignatureRef.current) { top10SignatureRef.current = ns; setSongs(st); } }
      if (typeof data.version === "number") versionRef.current = data.version;
    } catch {
      setSongs(prev); top10SignatureRef.current = getTop10Signature(prev);
      setVotedTrackIds((p) => { const n = new Set(p); wasVoted ? n.add(trackId) : n.delete(trackId); return n; });
    } finally {
      setPendingVoteTrackIds((p) => { const n = new Set(p); n.delete(trackId); return n; });
    }
  };

  /* ── Suggestion Search ───────────────────────────────────────────────── */

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setSearchResults([]); return; }
    setSearchLoading(true);
    try {
      const res = await fetch(`/api/party/suggest-search?q=${encodeURIComponent(q)}&limit=8`);
      const data = await res.json();
      setSearchResults(Array.isArray(data.tracks) ? data.tracks : []);
    } catch { setSearchResults([]); }
    finally { setSearchLoading(false); }
  }, []);

  const onSearchInput = (value: string) => {
    setSearchQuery(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => doSearch(value), 350);
  };

  /* ── Submit Suggestion ───────────────────────────────────────────────── */

  const submitSuggestion = async (track: Track) => {
    setSuggestPending(true);
    try {
      const res = await fetch("/api/party/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partyId, track, clientId: clientId.current || getClientId() }),
      });
      const data = await res.json();
      if (data.status === "ok") {
        setShowSearch(false);
        setSearchQuery("");
        setSearchResults([]);
        if (Array.isArray(data.suggestions)) setSuggestions(data.suggestions);
      }
    } catch {}
    finally { setSuggestPending(false); }
  };

  /* ── Vote on Suggestion ──────────────────────────────────────────────── */

  const voteSuggestion = async (trackId: string) => {
    const cid = clientId.current || getClientId();
    const s = suggestions.find((s) => s.track.id === trackId);
    const alreadyVoted = s?.votes.includes(cid);
    try {
      const res = await fetch("/api/party/suggest-vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partyId, trackId, clientId: cid, action: alreadyVoted ? "unvote" : "vote" }),
      });
      const data = await res.json();
      if (Array.isArray(data.suggestions)) setSuggestions(data.suggestions);
    } catch {}
  };

  /* ── Derived state ───────────────────────────────────────────────────── */

  const myActiveSuggestion = suggestions.find((s) => s.suggestedBy === (clientId.current || getClientId()));
  const canSuggest = suggestionsEnabled && !myActiveSuggestion;

  /* ── Render ──────────────────────────────────────────────────────────── */

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

        {/* Suggestions Pill */}
        {suggestionsEnabled && (
          <div className="flex-shrink-0 px-3 pb-2">
            <button
              onClick={() => setShowSuggestions(true)}
              className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 bg-amber-950/30 border border-amber-800/30 active:bg-amber-950/50 transition-colors"
            >
              <span className="text-base leading-none">💡</span>
              {suggestions.length > 0 ? (
                <>
                  <div className="flex-1 min-w-0 text-left">
                    <Ticker text={suggestions[0].track.name} className="text-sm font-medium text-amber-200 leading-tight" />
                    <span className="text-[11px] text-amber-400/70">
                      {suggestions.length === 1 ? "1 Vorschlag" : `${suggestions.length} Vorschläge`}
                      {" · "}{suggestionThreshold} Votes nötig
                    </span>
                  </div>
                  <span className="flex-shrink-0 bg-amber-500 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">
                    {suggestions.length}
                  </span>
                </>
              ) : (
                <span className="flex-1 text-sm text-amber-400/70 text-left">Song vorschlagen...</span>
              )}
              <svg className="w-4 h-4 text-amber-500/50 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
              </svg>
            </button>
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

          {/* Queue tracks */}
          <div className="space-y-1.5">
            {songs.map((s, i) => {
              const voted = votedTrackIds.has(s.id);
              const pending = pendingVoteTrackIds.has(s.id);
              const spotifyLink = buildSpotifyLink(s);

              return (
                <div
                  key={`${s.id}-${s.addedAt}`}
                  className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-colors ${
                    voted ? "bg-green-950/40 border border-green-800/30" : "bg-neutral-900/70 border border-neutral-800/50"
                  }`}
                >
                  <div className="relative flex-shrink-0">
                    {s.albumArt ? (
                      <img src={s.albumArt} alt={s.name} className="w-11 h-11 rounded-lg object-cover" />
                    ) : (
                      <div className="w-11 h-11 bg-neutral-800 rounded-lg" />
                    )}
                    <span className="absolute -top-1 -left-1 bg-neutral-800 border border-neutral-700 text-[10px] font-bold text-neutral-300 w-5 h-5 rounded-full flex items-center justify-center">
                      {i + 1}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <Ticker text={s.name} className="text-sm font-medium text-white leading-tight" />
                    <Ticker text={s.artist} className="text-xs text-neutral-400 leading-tight mt-0.5" />
                  </div>
                  {spotifyLink && (
                    <a href={spotifyLink} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-neutral-800 active:bg-neutral-700" aria-label="Auf Spotify anhören">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="#1DB954">
                        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                      </svg>
                    </a>
                  )}
                  <button
                    disabled={pending}
                    onClick={() => vote(s.id)}
                    className={`flex-shrink-0 flex flex-col items-center justify-center w-11 h-11 rounded-xl font-semibold transition-transform active:scale-90 ${
                      pending ? "bg-neutral-800 text-neutral-600" : voted ? "bg-green-500 text-white" : "bg-white/10 text-white active:bg-white/20"
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
          <div className="fixed bottom-0 left-0 right-0" style={{ zIndex: 30 }}>
            <div className="mx-2 mb-[max(0.5rem,env(safe-area-inset-bottom))] bg-neutral-900/95 backdrop-blur-xl border border-neutral-800/60 rounded-2xl px-3 py-2.5 shadow-2xl shadow-black/50">
              <div className="flex items-center gap-3">
                {currentTrack.albumArt ? (
                  <img src={currentTrack.albumArt} alt={currentTrack.name} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
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

        {/* Suggestions Bottom Sheet */}
        {showSuggestions && (
          <div className="fixed inset-0 z-50 flex flex-col" onClick={() => { setShowSuggestions(false); setShowSearch(false); setSearchQuery(""); setSearchResults([]); }}>
            <div className="flex-1 bg-black/60" />
            <div
              className="bg-neutral-900 rounded-t-2xl max-h-[85dvh] flex flex-col"
              style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Handle */}
              <div className="flex justify-center py-2">
                <div className="w-10 h-1 bg-neutral-700 rounded-full" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-4 pb-3">
                <div>
                  <h2 className="text-base font-semibold text-white">Vorschläge</h2>
                  <p className="text-[11px] text-neutral-500">{suggestionThreshold} Votes zum Hinzufügen</p>
                </div>
                {canSuggest && !showSearch && (
                  <button
                    onClick={() => setShowSearch(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-semibold active:scale-95 transition-transform"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Vorschlagen
                  </button>
                )}
              </div>

              {/* Search area (inline in sheet) */}
              {showSearch && (
                <div className="px-4 pb-3">
                  <input
                    autoFocus
                    type="text"
                    placeholder="Song suchen..."
                    value={searchQuery}
                    onChange={(e) => onSearchInput(e.target.value)}
                    className="w-full px-4 py-2.5 bg-neutral-800 rounded-xl text-sm text-white placeholder:text-neutral-500 outline-none focus:ring-1 focus:ring-amber-500/50"
                  />
                </div>
              )}

              <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3">
                {/* Search results */}
                {showSearch && searchQuery.length >= 2 && (
                  <div className="mb-4">
                    {searchLoading && (
                      <p className="text-center text-neutral-500 text-xs py-4">Suche...</p>
                    )}
                    {!searchLoading && searchResults.length === 0 && (
                      <p className="text-center text-neutral-500 text-xs py-4">Keine Ergebnisse</p>
                    )}
                    <div className="space-y-1">
                      {searchResults.map((t) => (
                        <button
                          key={t.id}
                          disabled={suggestPending}
                          onClick={() => submitSuggestion(t)}
                          className="flex items-center gap-3 w-full text-left rounded-xl px-3 py-2 active:bg-neutral-800 transition-colors"
                        >
                          {t.albumArt ? (
                            <img src={t.albumArt} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-10 h-10 bg-neutral-800 rounded-lg flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{t.name}</p>
                            <p className="text-xs text-neutral-400 truncate">{t.artist}</p>
                          </div>
                          <span className="text-[11px] text-amber-400 font-medium flex-shrink-0">Vorschlagen</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Suggestion list */}
                {suggestions.length === 0 && !showSearch && (
                  <p className="text-center text-neutral-500 text-sm py-8">Noch keine Vorschläge</p>
                )}
                {suggestions.length > 0 && (
                  <div className="space-y-1.5">
                    {(!showSearch || searchQuery.length < 2) && (
                      <p className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-1 px-1">
                        {suggestions.length === 1 ? "1 Vorschlag" : `${suggestions.length} Vorschläge`}
                      </p>
                    )}
                    {suggestions.map((s) => {
                      const cid = clientId.current || getClientId();
                      const iVoted = s.votes.includes(cid);
                      const progress = s.votes.length;
                      return (
                        <div
                          key={s.track.id}
                          className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 bg-amber-950/30 border border-amber-800/30"
                        >
                          {s.track.albumArt ? (
                            <img src={s.track.albumArt} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-10 h-10 bg-neutral-800 rounded-lg flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <Ticker text={s.track.name} className="text-sm font-medium text-white leading-tight" />
                            <Ticker text={s.track.artist} className="text-xs text-neutral-400 leading-tight mt-0.5" />
                            <div className="flex items-center gap-1.5 mt-1">
                              <div className="flex-1 h-1 bg-neutral-800 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-amber-500 rounded-full transition-all duration-300"
                                  style={{ width: `${Math.min(100, (progress / suggestionThreshold) * 100)}%` }}
                                />
                              </div>
                              <span className="text-[10px] text-amber-400 font-bold flex-shrink-0">
                                {progress}/{suggestionThreshold}
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => voteSuggestion(s.track.id)}
                            className={`flex-shrink-0 flex flex-col items-center justify-center w-11 h-11 rounded-xl font-semibold transition-transform active:scale-90 ${
                              iVoted ? "bg-amber-500 text-white" : "bg-white/10 text-white active:bg-white/20"
                            }`}
                          >
                            <span className="text-base leading-none">👍</span>
                            <span className={`text-[10px] font-bold leading-none mt-0.5 ${iVoted ? "text-white" : "text-neutral-400"}`}>{progress}</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
