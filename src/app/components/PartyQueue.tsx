"use client";

import { DragEvent, Fragment, TouchEvent, useState, useEffect } from "react";
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
import type { PartyTrack } from "../lib/providers/types";

interface PartyListItem {
  partyId: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  settings?: PartySettings;
}

export default function PartyQueue() {
  const MOBILE_TOP_LIMIT = 10;
  const { partyId, setPartyId, isPartyActive, setIsPartyActive } = useParty();
  const [showQr, setShowQr] = useState(false);
  const [queue, setQueue] = useState<PartyTrack[]>([]);
  const [parties, setParties] = useState<PartyListItem[]>([]);
  const [newPartyName, setNewPartyName] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [dragFromIndex, setDragFromIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [touchDragFromIndex, setTouchDragFromIndex] = useState<number | null>(null);
  const [touchDragOverIndex, setTouchDragOverIndex] = useState<number | null>(null);
  const [openTrackMenu, setOpenTrackMenu] = useState<number | null>(null);
  const [showPartyManagement, setShowPartyManagement] = useState(false);
  const [pendingSettings, setPendingSettings] = useState<PartySettings>(
    DEFAULT_PARTY_SETTINGS
  );
  const [settingsSaveMessage, setSettingsSaveMessage] = useState<string | null>(null);
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

  const handleTrackDragStart = (index: number) => {
    setDragFromIndex(index);
    closeTrackMenu();
  };

  const handleTrackDrop = async (toIndex: number) => {
    if (!partyId || dragFromIndex === null || dragFromIndex === toIndex) {
      setDragFromIndex(null);
      setDragOverIndex(null);
      return;
    }

    await reorderTrack(dragFromIndex, toIndex);
    setDragFromIndex(null);
    setDragOverIndex(null);
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

  const handleRemoveTrack = async (index: number) => {
    if (!partyId) return;

    try {
      const res = await fetch("/api/party/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partyId, index }),
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

  const partyUrl = partyId ? `${partyBaseUrl}/${partyId}/vote` : "";
  const effectiveDragOverIndex =
    dragOverIndex !== null ? dragOverIndex : touchDragOverIndex;

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
      <ul className="space-y-2 overflow-y-auto overscroll-contain pb-28">
        {queue.length === 0 ? (
          <p className="text-gray-400 text-sm text-center">Noch keine Songs in der Queue 🎵</p>
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
                    e.preventDefault();
                    setDragOverIndex(index);
                  }}
                  onDragLeave={() => {
                    if (dragOverIndex === index) setDragOverIndex(null);
                  }}
                  onDrop={(e: DragEvent<HTMLLIElement>) => {
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
                    effectiveDragOverIndex === index
                      ? "border-green-500"
                      : isInMobileTop
                      ? "border-yellow-700"
                      : "border-neutral-800"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {track.albumArt && (
                      <img
                        src={track.albumArt}
                        alt={track.name}
                        className="w-12 h-12 rounded-md object-cover"
                      />
                    )}
                    <div>
                      <p className="text-gray-100 font-medium truncate">{track.name}</p>
                      <p className="text-gray-400 text-sm truncate">{track.artist}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 relative">
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
                        setDragOverIndex(null);
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
                          onClick={() => void handleRemoveTrack(index)}
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
