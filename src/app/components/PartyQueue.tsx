"use client";

import { useState, useEffect } from "react";
import QRCode from "react-qr-code";
import { useParty } from "@/app/context/PartyContext";
// Typ aus deinem bestehenden Spotify-Provider
// Beispiel: src/app/lib/types/track.ts
import type { PartyTrack } from "../lib/providers/types";

interface PartyListItem {
  partyId: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function PartyQueue() {
  const { partyId, setPartyId, isPartyActive, setIsPartyActive } = useParty();
  const [showQr, setShowQr] = useState(false);
  const [queue, setQueue] = useState<PartyTrack[]>([]);
  const [parties, setParties] = useState<PartyListItem[]>([]);
  const [newPartyName, setNewPartyName] = useState("");
  const [isBusy, setIsBusy] = useState(false);
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
        body: JSON.stringify({ name: newPartyName || undefined }),
      });

      if (!res.ok) {
        console.error("Party konnte nicht gestartet werden");
        return;
      }

      const data = await res.json();
      setPartyId(data.partyId);
      setIsPartyActive(true);
      setNewPartyName("");
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

  const partyUrl = partyId ? `${partyBaseUrl}/${partyId}/vote` : "";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="sticky top-0 z-10 pb-3 mb-4 border-b border-neutral-800 bg-neutral-950">
        <h2 className="text-lg font-semibold text-white">🎉 Party Queue</h2>

        <div className="mt-3 space-y-3">
          <div className="flex gap-2">
            <input
              value={newPartyName}
              onChange={(e) => setNewPartyName(e.target.value)}
              placeholder="Party-Name (optional)"
              className="flex-1 px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-sm text-gray-100 placeholder:text-gray-500"
            />
            <button
              onClick={handleCreateParty}
              disabled={isBusy}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 rounded-lg text-white text-sm"
            >
              Neue Party
            </button>
          </div>

          <div className="space-y-2 max-h-32 overflow-y-auto pr-1">
            {parties.length === 0 ? (
              <p className="text-xs text-gray-500">Keine gespeicherten Partys</p>
            ) : (
              parties.map((party) => (
                <div
                  key={party.partyId}
                  className="flex items-center justify-between gap-2 bg-neutral-900 border border-neutral-800 rounded-md px-2 py-1.5"
                >
                  <button
                    onClick={() => handleLoadParty(party.partyId)}
                    disabled={isBusy}
                    className={`text-left text-sm truncate flex-1 ${
                      party.partyId === partyId
                        ? "text-green-400"
                        : "text-gray-200 hover:text-white"
                    }`}
                  >
                    {party.name}
                  </button>
                  <button
                    onClick={() => handleDeleteParty(party.partyId)}
                    disabled={isBusy}
                    className="text-xs px-2 py-1 rounded bg-red-700 hover:bg-red-800 text-white disabled:opacity-60"
                  >
                    Löschen
                  </button>
                </div>
              ))
            )}
          </div>

          {isPartyActive && (
            <div className="flex gap-2">
              <button
                onClick={handleShowQr}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white text-sm"
              >
                QR-Code anzeigen
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Queue */}
      <ul className="space-y-2 overflow-y-auto pb-28">
        {queue.length === 0 ? (
          <p className="text-gray-400 text-sm text-center">Noch keine Songs in der Queue 🎵</p>
        ) : (
          queue.map((track) => (
            <li
              key={track.id}
              className="flex items-center justify-between bg-neutral-900 border border-neutral-800 rounded-lg p-3 hover:bg-neutral-800 transition"
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
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-400">{track.votes ?? 0} </span>
                <button
                  className="text-sm text-gray-300 hover:text-white transition"
                >
                  👍
                </button>
              </div>
            </li>
          ))
        )}
      </ul>

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
