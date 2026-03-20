"use client";

import {
  PARTY_GENRE_OPTIONS,
  type PartyGenre,
  type PartySettings,
} from "@/app/lib/party/settings";

interface PartyListItem {
  partyId: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  settings?: PartySettings;
}

interface PartyManagementSheetProps {
  isOpen: boolean;
  onClose: () => void;
  parties: PartyListItem[];
  activePartyId: string | null;
  newPartyName: string;
  onNewPartyNameChange: (value: string) => void;
  pendingSettings: PartySettings;
  onToggleGenre: (genre: PartyGenre) => void;
  onPendingSettingsChange: (next: PartySettings) => void;
  onCreateParty: () => Promise<void>;
  onSaveSettings: () => Promise<void>;
  onLoadParty: (partyId: string) => Promise<void>;
  onDeleteParty: (partyId: string) => Promise<void>;
  isBusy: boolean;
  saveMessage: string | null;
}

export default function PartyManagementSheet({
  isOpen,
  onClose,
  parties,
  activePartyId,
  newPartyName,
  onNewPartyNameChange,
  pendingSettings,
  onToggleGenre,
  onPendingSettingsChange,
  onCreateParty,
  onSaveSettings,
  onLoadParty,
  onDeleteParty,
  isBusy,
  saveMessage,
}: PartyManagementSheetProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40">
      <div
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
        aria-hidden="true"
      />
      <section
        className="absolute inset-x-0 bottom-0 max-h-[82dvh] rounded-t-2xl border border-neutral-800 bg-neutral-950 p-4 shadow-2xl sm:inset-y-0 sm:right-0 sm:left-auto sm:w-[440px] sm:max-h-none sm:rounded-none sm:rounded-l-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Party Verwaltung"
      >
        <div className="mb-3 flex items-center justify-between gap-3 border-b border-neutral-800 pb-3">
          <div>
            <h3 className="text-lg font-semibold text-white">Party Verwaltung</h3>
            <p className="text-xs text-gray-400">
              Erstellen, auswählen und löschen
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md bg-neutral-800 px-3 py-2 text-sm text-gray-200 hover:bg-neutral-700"
          >
            Schließen
          </button>
        </div>

        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              value={newPartyName}
              onChange={(e) => onNewPartyNameChange(e.target.value)}
              placeholder="Party-Name (optional)"
              className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm text-gray-100 placeholder:text-gray-500"
            />
            <button
              onClick={() => void onCreateParty()}
              disabled={isBusy}
              className="min-h-11 rounded-lg bg-green-600 px-4 py-2.5 text-sm text-white hover:bg-green-700 disabled:opacity-60"
            >
              Neue Party
            </button>
          </div>

          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
            <p className="mb-2 text-sm font-medium text-gray-100">Genres</p>
            <div className="flex flex-wrap gap-2">
              {PARTY_GENRE_OPTIONS.map((genre) => {
                const selected = pendingSettings.genres.includes(genre);
                return (
                  <button
                    key={genre}
                    onClick={() => onToggleGenre(genre)}
                    type="button"
                    className={`rounded-full border px-3 py-1.5 text-xs transition ${
                      selected
                        ? "border-green-500 bg-green-700/30 text-green-300"
                        : "border-neutral-700 bg-neutral-800 text-gray-300 hover:bg-neutral-700"
                    }`}
                  >
                    {genre}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-900 p-3">
            <p className="text-sm font-medium text-gray-100">Auto-Queue (Vorbereitung)</p>

            <label className="flex items-center justify-between gap-3">
              <span className="text-sm text-gray-300">Auto-Fill aktivieren</span>
              <input
                type="checkbox"
                checked={pendingSettings.autoFillEnabled}
                onChange={(e) =>
                  onPendingSettingsChange({
                    ...pendingSettings,
                    autoFillEnabled: e.target.checked,
                  })
                }
                className="h-4 w-4 accent-green-500"
              />
            </label>

            <label className="block">
              <span className="text-sm text-gray-300">Zielgröße Queue</span>
              <input
                type="number"
                min={5}
                max={200}
                value={pendingSettings.targetQueueSize}
                onChange={(e) =>
                  onPendingSettingsChange({
                    ...pendingSettings,
                    targetQueueSize: Math.min(
                      200,
                      Math.max(5, Number.parseInt(e.target.value || "20", 10) || 20)
                    ),
                  })
                }
                className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-gray-100"
              />
            </label>

            <label className="block">
              <span className="text-sm text-gray-300">Fade zwischen Songs (Sek.)</span>
              <input
                type="number"
                min={0}
                max={12}
                value={pendingSettings.fadeSeconds}
                onChange={(e) =>
                  onPendingSettingsChange({
                    ...pendingSettings,
                    fadeSeconds: Math.min(
                      12,
                      Math.max(0, Number.parseInt(e.target.value || "0", 10) || 0)
                    ),
                  })
                }
                className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-gray-100"
              />
            </label>

            <label className="flex items-center justify-between gap-3">
              <span className="text-sm text-gray-300">Explicit erlauben</span>
              <input
                type="checkbox"
                checked={pendingSettings.allowExplicit}
                onChange={(e) =>
                  onPendingSettingsChange({
                    ...pendingSettings,
                    allowExplicit: e.target.checked,
                  })
                }
                className="h-4 w-4 accent-green-500"
              />
            </label>

            <button
              onClick={() => void onSaveSettings()}
              disabled={isBusy || !activePartyId}
              className="w-full min-h-10 rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Einstellungen speichern und Queue befüllen
            </button>
            {saveMessage && <p className="text-xs text-gray-400">{saveMessage}</p>}
          </div>

          <div className="max-h-[55dvh] space-y-2 overflow-y-auto pr-1 sm:max-h-[calc(100dvh-210px)]">
            {parties.length === 0 ? (
              <p className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-gray-500">
                Keine gespeicherten Partys
              </p>
            ) : (
              parties.map((party) => (
                <div
                  key={party.partyId}
                  className="flex items-center justify-between gap-2 rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-2"
                >
                  <button
                    onClick={() => void onLoadParty(party.partyId)}
                    disabled={isBusy}
                    className={`flex-1 truncate text-left text-sm ${
                      party.partyId === activePartyId
                        ? "text-green-400"
                        : "text-gray-200 hover:text-white"
                    }`}
                  >
                    {party.name}
                    {party.settings?.genres?.length ? (
                      <span className="ml-2 text-[11px] text-gray-400">
                        · {party.settings.genres.slice(0, 2).join(", ")}
                        {party.settings.genres.length > 2 ? " +" : ""}
                      </span>
                    ) : null}
                  </button>
                  <button
                    onClick={() => void onDeleteParty(party.partyId)}
                    disabled={isBusy}
                    className="min-h-9 rounded bg-red-700 px-3 py-1.5 text-xs text-white hover:bg-red-800 disabled:opacity-60"
                  >
                    Löschen
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
