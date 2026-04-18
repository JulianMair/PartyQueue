"use client";

import { DragEvent, Fragment, TouchEvent, useState, useEffect, useRef } from "react";
import QRCode from "react-qr-code";
import { useParty } from "@/app/context/PartyContext";
import PartyManagementSheet from "@/app/components/PartyManagementSheet";
import {
  DEFAULT_PARTY_SETTINGS,
  type PartyGenre,
  type PartySettings,
} from "@/app/lib/party/settings";
// Typ aus deinem bestehenden Spotify-Provider
// Beispiel: src/app/lib/types/track.ts
import type { PartyTrack, Track } from "../lib/providers/types";

/* Ticker: scrollt Text horizontal, wenn er nicht in den Container passt.
   Gleicher Mechanismus wie in der Voting-Seite, damit lange Song-/Artist-Namen
   in der Host-Queue nicht abgeschnitten werden. */
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
    return () => {
      cancelAnimationFrame(id);
      ro.disconnect();
    };
  }, [text]);

  return (
    <div ref={ref} className={`overflow-hidden whitespace-nowrap ${className}`}>
      {scroll ? (
        <span className="inline-flex ticker-scroll">
          <span className="pr-8">{text}</span>
          <span aria-hidden className="pr-8">{text}</span>
        </span>
      ) : (
        text
      )}
    </div>
  );
}

interface PartyListItem {
  partyId: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  settings?: PartySettings;
}

export default function PartyQueue() {
  const SEARCH_TRACK_DRAG_MIME = "application/x-partyqueue-search-track";
  const MOBILE_TOP_LIMIT = 10;
  const { partyId, setPartyId, isPartyActive, setIsPartyActive } = useParty();
  const [showQr, setShowQr] = useState(false);
  const [queue, setQueue] = useState<PartyTrack[]>([]);
  const [parties, setParties] = useState<PartyListItem[]>([]);
  const [newPartyName, setNewPartyName] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [dragFromIndex, setDragFromIndex] = useState<number | null>(null);
  const [queueDragOverIndex, setQueueDragOverIndex] = useState<number | null>(null);
  const [searchDropOverIndex, setSearchDropOverIndex] = useState<number | null>(null);
  const [touchDragFromIndex, setTouchDragFromIndex] = useState<number | null>(null);
  const [touchDragOverIndex, setTouchDragOverIndex] = useState<number | null>(null);
  const [openTrackMenu, setOpenTrackMenu] = useState<number | null>(null);
  const [showPartyManagement, setShowPartyManagement] = useState(false);
  const [pendingSettings, setPendingSettings] = useState<PartySettings>(
    DEFAULT_PARTY_SETTINGS
  );
  const [settingsSaveMessage, setSettingsSaveMessage] = useState<string | null>(null);
  const [isSearchTrackDropActive, setIsSearchTrackDropActive] = useState(false);
  const BASIC_URI = process.env.NEXT_PUBLIC_BASE_URL!;

  const partyBaseUrl = `${BASIC_URI}/party`; // später dynamisch aus ENV

  const fetchParties = async () => {
    const res = await fetch("/api/party/list", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setParties(Array.isArray(data.parties) ? data.parties : []);
  };

  // Party starten (Backend ruft SpotifyProvider über Factory auf)
  async function handleCreateParty() {
    setIsBusy(true);
    try {
      const res = await fetch("/api/party/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newPartyName || undefined,
          settings: pendingSettings,
        }),
      });

      if (!res.ok) {
        console.error("Party konnte nicht gestartet werden");
        return;
      }

      const data = await res.json();
      setPartyId(data.partyId);
      setIsPartyActive(true);
      setNewPartyName("");
      setPendingSettings(DEFAULT_PARTY_SETTINGS);
      setShowPartyManagement(false);
      await fetchParties();
    } finally {
      setIsBusy(false);
    }
  }

  async function handleLoadParty(targetPartyId: string) {
    setIsBusy(true);
    try {
      const res = await fetch("/api/party/load", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partyId: targetPartyId }),
      });

      if (!res.ok) {
        console.error("Party konnte nicht geladen werden");
        return;
      }

      const data = await res.json();
      setPartyId(targetPartyId);
      setIsPartyActive(Boolean(data?.party?.isActive));
      setQueue(Array.isArray(data?.party?.queue) ? data.party.queue : []);
      if (data?.party?.settings) {
        setPendingSettings(data.party.settings);
      }
      setShowPartyManagement(false);
      await fetchParties();
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDeleteParty(targetPartyId: string) {
    setIsBusy(true);
    try {
      const res = await fetch("/api/party/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partyId: targetPartyId }),
      });

      if (!res.ok) {
        console.error("Party konnte nicht gelöscht werden");
        return;
      }

      if (partyId === targetPartyId) {
        setPartyId(null);
        setIsPartyActive(false);
        setQueue([]);
      }

      await fetchParties();
    } finally {
      setIsBusy(false);
    }
  }

  // Queue regelmäßig vom Server abholen (später WebSocket/SSE)
  useEffect(() => {
    if (partyId) return;

    const hydrateActiveParty = async () => {
      const res = await fetch("/api/party/active");
      if (!res.ok) return;

      const data = await res.json();
      if (!data?.partyId) return;

      setPartyId(data.partyId);
      setIsPartyActive(Boolean(data.isActive));
      if (Array.isArray(data.queue)) {
        setQueue(data.queue);
      }
    };

    hydrateActiveParty();
  }, [partyId, setIsPartyActive, setPartyId]);

  useEffect(() => {
    fetchParties();
  }, []);

  // Queue regelmäßig vom Server abholen (später WebSocket/SSE)
  useEffect(() => {
    if (!partyId) return;

    const fetchQueue = async () => {
      const res = await fetch(`/api/party/state?partyId=${partyId}`);
      if (res.ok) {
        const data = await res.json();
        setQueue(data.queue);
      }
    };

    fetchQueue();
    const interval = setInterval(fetchQueue, 2000); // Polling
    return () => clearInterval(interval);
  }, [partyId]);

  const handleShowQr = () => setShowQr((prev) => !prev);
  const closeTrackMenu = () => setOpenTrackMenu(null);
  const toggleGenre = (genre: PartyGenre) => {
    setPendingSettings((prev) => {
      const hasGenre = prev.genres.includes(genre);
      return {
        ...prev,
        genres: hasGenre
          ? prev.genres.filter((item) => item !== genre)
          : [...prev.genres, genre],
      };
    });
  };

  const handleSaveSettings = async () => {
    if (!partyId) return;
    setIsBusy(true);
    setSettingsSaveMessage(null);

    try {
      const res = await fetch("/api/party/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partyId, settings: pendingSettings }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSettingsSaveMessage(data?.error || "Einstellungen konnten nicht gespeichert werden");
        return;
      }

      if (Array.isArray(data.queue)) {
        setQueue(data.queue);
      }
      setSettingsSaveMessage(
        `${data?.addedCount ?? 0} Songs passend zu den Genres hinzugefügt`
      );
      await fetchParties();
    } finally {
      setIsBusy(false);
    }
  };

  useEffect(() => {
    if (!showPartyManagement) return;
    const activeParty = parties.find((party) => party.partyId === partyId);
    if (activeParty?.settings) {
      setPendingSettings(activeParty.settings);
    }
  }, [showPartyManagement, parties, partyId]);

  useEffect(() => {
    const clearDropHighlight = () => {
      setIsSearchTrackDropActive(false);
      setSearchDropOverIndex(null);
      setQueueDragOverIndex(null);
      setTouchDragFromIndex(null);
      setTouchDragOverIndex(null);
    };
    window.addEventListener("dragend", clearDropHighlight);
    window.addEventListener("drop", clearDropHighlight);

    return () => {
      window.removeEventListener("dragend", clearDropHighlight);
      window.removeEventListener("drop", clearDropHighlight);
    };
  }, []);

  const handleTrackDragStart = (index: number) => {
    setDragFromIndex(index);
    closeTrackMenu();
  };

  const handleTrackDrop = async (toIndex: number) => {
    if (!partyId || dragFromIndex === null || dragFromIndex === toIndex) {
      setDragFromIndex(null);
      setQueueDragOverIndex(null);
      return;
    }

    await reorderTrack(dragFromIndex, toIndex);
    setDragFromIndex(null);
    setQueueDragOverIndex(null);
  };

  const reorderTrack = async (fromIndex: number, toIndex: number) => {
    if (!partyId || fromIndex === toIndex) return;

    try {
      const res = await fetch("/api/party/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partyId, fromIndex, toIndex }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.queue)) {
        setQueue(data.queue);
      }
    } catch (err) {
      console.error("Fehler beim Verschieben:", err);
    }
  };

  const handleRemoveTrack = async (trackId: string, index: number) => {
    if (!partyId) return;

    try {
      const res = await fetch("/api/party/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partyId, trackId, index }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.queue)) {
        setQueue(data.queue);
      }
    } finally {
      closeTrackMenu();
    }
  };

  const extractSearchTrackFromDrop = (
    event: DragEvent<HTMLElement>
  ): Track | null => {
    const payload =
      event.dataTransfer.getData(SEARCH_TRACK_DRAG_MIME) ||
      event.dataTransfer.getData("text/plain");
    if (!payload) return null;

    try {
      const parsed = JSON.parse(payload) as { type?: string; track?: Track };
      if (parsed?.type !== "partyqueue-search-track" || !parsed.track?.id) {
        return null;
      }
      return parsed.track;
    } catch {
      return null;
    }
  };

  const isSearchTrackDragEvent = (event: DragEvent<HTMLElement>) =>
    event.dataTransfer.types.includes(SEARCH_TRACK_DRAG_MIME);

  const addDroppedSearchTrack = async (track: Track, insertIndex?: number) => {
    if (!partyId) return;
    try {
      const res = await fetch("/api/party/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partyId, track, insertIndex }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.queue)) {
        setQueue(data.queue);
      }
    } catch (err) {
      console.error("Fehler beim Hinzufügen per Drag-and-Drop:", err);
    }
  };

  const partyUrl = partyId ? `${partyBaseUrl}/${partyId}/vote` : "";
  const effectiveQueueDragOverIndex =
    queueDragOverIndex !== null ? queueDragOverIndex : touchDragOverIndex;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="sticky top-0 z-10 mb-3 border-b border-neutral-800 bg-neutral-950 pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-white">🎉 Party Queue</h2>
            <p className="truncate text-xs text-gray-400">
              {partyId
                ? `Aktive Party: ${parties.find((p) => p.partyId === partyId)?.name ?? partyId}`
                : "Keine aktive Party"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPartyManagement(true)}
              className="min-h-10 rounded-lg bg-neutral-800 px-3 py-2 text-sm text-gray-100 hover:bg-neutral-700"
            >
              Verwalten
            </button>
            {isPartyActive && (
              <button
                onClick={handleShowQr}
                className="min-h-10 rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
              >
                QR
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Queue */}
      <ul
        className="space-y-2 overflow-y-auto overscroll-contain pb-28"
        onDragEndCapture={() => {
          setIsSearchTrackDropActive(false);
          setSearchDropOverIndex(null);
          setQueueDragOverIndex(null);
          setTouchDragFromIndex(null);
          setTouchDragOverIndex(null);
        }}
        onDropCapture={() => {
          setIsSearchTrackDropActive(false);
          setSearchDropOverIndex(null);
          setQueueDragOverIndex(null);
          setTouchDragFromIndex(null);
          setTouchDragOverIndex(null);
        }}
        onDragOver={(event) => {
          if (!isSearchTrackDragEvent(event)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          setIsSearchTrackDropActive(true);
          setSearchDropOverIndex(null);
        }}
        onDragLeave={() => {
          setIsSearchTrackDropActive(false);
          setSearchDropOverIndex(null);
        }}
        onDrop={(event) => {
          event.stopPropagation();
          const droppedTrack = extractSearchTrackFromDrop(event);
          if (!droppedTrack) return;
          event.preventDefault();
          setIsSearchTrackDropActive(false);
          setSearchDropOverIndex(null);
          setQueueDragOverIndex(null);
          void addDroppedSearchTrack(droppedTrack);
        }}
      >
        {queue.length === 0 ? (
          <p
            className={`text-sm text-center rounded-lg border border-dashed p-4 transition ${
              isSearchTrackDropActive
                ? "text-green-200 border-green-500 bg-green-900/20"
                : "text-gray-400 border-neutral-700 bg-neutral-900/40"
            }`}
          >
            Noch keine Songs in der Queue 🎵
          </p>
        ) : (
          queue.map((track, index) => {
            const isInMobileTop = index < MOBILE_TOP_LIMIT;

            return (
              <Fragment key={`${track.id}-${track.addedAt}-${index}`}>
                {index === MOBILE_TOP_LIMIT && (
                  <li className="py-2">
                    <div className="border-t border-dashed border-yellow-600 pt-2 text-center text-xs text-yellow-400">
                      Ab hier nur Host-Queue (nicht im Mobile Voting)
                    </div>
                  </li>
                )}

                <li
                  data-queue-index={index}
                  onDragOver={(e: DragEvent<HTMLLIElement>) => {
                    if (isSearchTrackDragEvent(e)) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "copy";
                      setIsSearchTrackDropActive(true);
                      setSearchDropOverIndex(index);
                      setQueueDragOverIndex(null);
                      return;
                    }
                    e.preventDefault();
                    setQueueDragOverIndex(index);
                    setSearchDropOverIndex(null);
                  }}
                  onDragLeave={() => {
                    if (queueDragOverIndex === index) setQueueDragOverIndex(null);
                    if (searchDropOverIndex === index) setSearchDropOverIndex(null);
                  }}
                  onDrop={(e: DragEvent<HTMLLIElement>) => {
                    e.stopPropagation();
                    const droppedTrack = extractSearchTrackFromDrop(e);
                    if (droppedTrack) {
                      e.preventDefault();
                      setIsSearchTrackDropActive(false);
                      setSearchDropOverIndex(null);
                      setQueueDragOverIndex(null);
                      void addDroppedSearchTrack(droppedTrack, index);
                      return;
                    }
                    e.preventDefault();
                    void handleTrackDrop(index);
                  }}
                  onTouchMove={(e: TouchEvent<HTMLLIElement>) => {
                    if (touchDragFromIndex === null) return;
                    e.preventDefault();
                    const touch = e.touches[0];
                    if (!touch) return;
                    const element = document.elementFromPoint(touch.clientX, touch.clientY);
                    const target = element?.closest("[data-queue-index]") as HTMLElement | null;
                    const nextIndex = target
                      ? Number(target.getAttribute("data-queue-index"))
                      : null;
                    if (nextIndex !== null && !Number.isNaN(nextIndex)) {
                      setTouchDragOverIndex(nextIndex);
                    }
                  }}
                  onTouchEnd={() => {
                    if (
                      touchDragFromIndex !== null &&
                      touchDragOverIndex !== null &&
                      touchDragFromIndex !== touchDragOverIndex
                    ) {
                      void reorderTrack(touchDragFromIndex, touchDragOverIndex);
                    }
                    setTouchDragFromIndex(null);
                    setTouchDragOverIndex(null);
                  }}
                  onTouchCancel={() => {
                    setTouchDragFromIndex(null);
                    setTouchDragOverIndex(null);
                  }}
                  className={`flex items-center justify-between bg-neutral-900 border rounded-lg p-3 hover:bg-neutral-800 transition ${
                    searchDropOverIndex === index
                      ? "border-green-500 bg-green-900/20"
                      : effectiveQueueDragOverIndex === index
                      ? "border-sky-500"
                      : isInMobileTop
                      ? "border-yellow-700"
                      : "border-neutral-800"
                  }`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {track.albumArt && (
                      <img
                        src={track.albumArt}
                        alt={track.name}
                        className="w-12 h-12 rounded-md object-cover flex-shrink-0"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <Ticker text={track.name} className="text-gray-100 font-medium" />
                      <Ticker text={track.artist} className="text-gray-400 text-sm" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 relative flex-shrink-0">
                    {isInMobileTop && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-yellow-700/40 text-yellow-300 border border-yellow-700">
                        Mobile Top 10
                      </span>
                    )}
                    <span className="text-sm text-gray-400">{track.votes ?? 0}</span>
                    <div className="flex items-center gap-1 sm:hidden">
                      <button
                        onClick={() => void reorderTrack(index, Math.max(0, index - 1))}
                        disabled={index === 0}
                        className="px-2 py-1.5 min-h-9 rounded bg-neutral-800 text-gray-200 hover:bg-neutral-700 disabled:opacity-40"
                        title="Nach oben"
                        aria-label="Song nach oben"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() =>
                          void reorderTrack(index, Math.min(queue.length - 1, index + 1))
                        }
                        disabled={index >= queue.length - 1}
                        className="px-2 py-1.5 min-h-9 rounded bg-neutral-800 text-gray-200 hover:bg-neutral-700 disabled:opacity-40"
                        title="Nach unten"
                        aria-label="Song nach unten"
                      >
                        ↓
                      </button>
                    </div>
                    <button
                      draggable
                      onDragStart={() => handleTrackDragStart(index)}
                      onDragEnd={() => {
                        setDragFromIndex(null);
                        setQueueDragOverIndex(null);
                        setSearchDropOverIndex(null);
                      }}
                      className="hidden sm:inline-block text-sm px-2 py-1.5 min-h-9 rounded text-gray-300 hover:text-white hover:bg-neutral-700 transition cursor-grab active:cursor-grabbing"
                      title="Ziehen zum Verschieben"
                      onTouchStart={() => {
                        setTouchDragFromIndex(index);
                        setTouchDragOverIndex(index);
                        closeTrackMenu();
                      }}
                      style={{ touchAction: "none" }}
                    >
                      ☰
                    </button>
                    <button
                      onClick={() =>
                        setOpenTrackMenu((prev) => (prev === index ? null : index))
                      }
                      className="text-xs px-2.5 py-1.5 min-h-9 rounded bg-neutral-800 text-gray-300 hover:bg-neutral-700"
                      title="Song-Menü"
                    >
                      ⋮
                    </button>
                    {openTrackMenu === index && (
                      <div className="absolute right-0 top-8 z-10 w-36 bg-neutral-900 border border-neutral-700 rounded-md shadow-lg p-1">
                        <button
                          onClick={() => void reorderTrack(index, Math.max(0, index - 1))}
                          disabled={index === 0}
                          className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-neutral-800 rounded disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Nach oben
                        </button>
                        <button
                          onClick={() =>
                            void reorderTrack(index, Math.min(queue.length - 1, index + 1))
                          }
                          disabled={index >= queue.length - 1}
                          className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-neutral-800 rounded disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Nach unten
                        </button>
                        <button
                          onClick={() => void handleRemoveTrack(track.id, index)}
                          className="w-full text-left px-3 py-2 text-sm text-red-300 hover:bg-neutral-800 rounded"
                        >
                          Song löschen
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              </Fragment>
            );
          })
        )}
      </ul>

      <PartyManagementSheet
        isOpen={showPartyManagement}
        onClose={() => {
          setShowPartyManagement(false);
          setSettingsSaveMessage(null);
        }}
        parties={parties}
        activePartyId={partyId}
        newPartyName={newPartyName}
        onNewPartyNameChange={setNewPartyName}
        pendingSettings={pendingSettings}
        onToggleGenre={toggleGenre}
        onPendingSettingsChange={setPendingSettings}
        onCreateParty={handleCreateParty}
        onSaveSettings={handleSaveSettings}
        onLoadParty={handleLoadParty}
        onDeleteParty={handleDeleteParty}
        isBusy={isBusy}
        saveMessage={settingsSaveMessage}
      />

      {/* QR Modal */}
      {showQr && partyId && (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-20">
          <div className="bg-neutral-900 p-6 rounded-xl shadow-lg text-center">
            <h3 className="text-white mb-4 text-lg font-semibold">
              Scanne den Code, um der Party beizutreten 🎶
            </h3>
            <QRCode value={partyUrl} bgColor="#111" fgColor="#fff" />
            <p className="text-gray-400 text-sm mt-2">{partyUrl}</p>
            <button
              onClick={handleShowQr}
              className="mt-6 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg"
            >
              Schließen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
