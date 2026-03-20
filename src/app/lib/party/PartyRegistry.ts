// src/app/lib/party/PartyRegistry.ts
import { PartyManager } from "./PartyManager";
import { getProvider } from "../providers/factory";
import { PartyStore, type PartyMetadata } from "./partyStore";
import { DEFAULT_PARTY_SETTINGS, sanitizePartySettings, type PartySettings } from "./settings";
import type { Track } from "../providers/types";

class PartyRegistry {
  private static instance: PartyRegistry;
  private readonly parties: Map<string, PartyManager> = new Map();
  private readonly partyMeta: Map<string, PartyMetadata> = new Map();
  private readonly store = new PartyStore();
  private readonly defaultProvider = "spotify";
  private readonly persistTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private readonly autoFillTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private readonly autoFillRunning: Set<string> = new Set();
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  private constructor() {}

  static getInstance() {
    if (!PartyRegistry.instance) {
      PartyRegistry.instance = new PartyRegistry();
    }
    return PartyRegistry.instance;
  }

  private async ensureInitialized() {
    if (this.initialized) return;
    if (!this.initPromise) {
      this.initPromise = this.loadFromStore();
    }
    await this.initPromise;
  }

  private async loadFromStore() {
    const persistedParties = await this.store.loadAllParties();

    for (const persisted of persistedParties) {
      const provider = getProvider(persisted.providerName || this.defaultProvider);
      const manager = new PartyManager(
        persisted.partyId,
        provider,
        persisted.snapshot.state,
        persisted.snapshot.votedByClient
      );

      this.parties.set(persisted.partyId, manager);
      this.partyMeta.set(persisted.partyId, {
        partyId: persisted.partyId,
        name: persisted.name,
        providerName: persisted.providerName,
        isActive: persisted.isActive,
        createdAt: persisted.createdAt,
        updatedAt: persisted.updatedAt,
        settings: sanitizePartySettings(persisted.settings ?? DEFAULT_PARTY_SETTINGS),
      });
      manager.setFadeDurationSeconds(
        sanitizePartySettings(persisted.settings ?? DEFAULT_PARTY_SETTINGS).fadeSeconds
      );

      this.attachPersistence(manager, persisted.partyId);

      if (persisted.snapshot.state?.isActive) {
        void manager.startParty();
      }
    }

    this.initialized = true;
  }

  private attachPersistence(manager: PartyManager, partyId: string) {
    manager.on("stateChanged", () => {
      this.schedulePersist(partyId);
    });
    this.ensureAutoFillLoop(partyId);
  }

  private ensureAutoFillLoop(partyId: string) {
    if (this.autoFillTimers.has(partyId)) return;
    const timer = setInterval(() => {
      void this.runAutoFillCycle(partyId);
    }, 20_000);
    this.autoFillTimers.set(partyId, timer);
  }

  private schedulePersist(partyId: string, delayMs = 150) {
    const existing = this.persistTimers.get(partyId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.persistTimers.delete(partyId);
      void this.persistParty(partyId);
    }, delayMs);

    this.persistTimers.set(partyId, timer);
  }

  private async persistParty(partyId: string) {
    const manager = this.parties.get(partyId);
    const meta = this.partyMeta.get(partyId);
    if (!manager || !meta) return;

    const snapshot = {
      state: manager.getState(),
      votedByClient: manager.getVotedByClient(),
    };

    await this.store.updateParty(partyId, {
      snapshot,
      name: meta.name,
      providerName: meta.providerName,
      settings: meta.settings,
    });

    this.partyMeta.set(partyId, {
      ...meta,
      isActive: snapshot.state.isActive,
      updatedAt: new Date().toISOString(),
    });
  }

  private buildGenreQueries(genre: string) {
    const normalized = genre.trim().toLowerCase();
    const base = normalized === "90s" ? "90s hits" : `${genre} hits`;
    return [`genre:${normalized}`, base];
  }

  private async collectGenreTracks(
    partyId: string,
    settings: PartySettings,
    desiredCount: number,
    externalExcludedTrackIds?: Set<string>
  ): Promise<Track[]> {
    if (settings.genres.length === 0 || desiredCount <= 0) return [];

    const manager = this.parties.get(partyId);
    if (!manager) return [];

    const meta = this.partyMeta.get(partyId);
    const provider = getProvider(meta?.providerName || this.defaultProvider);

    const perGenreLimit = Math.max(8, Math.ceil((desiredCount * 2) / settings.genres.length));
    const existingTrackIds = new Set(
      manager
        .getState()
        .queue.map((track) => track.id)
        .concat(manager.getState().currentTrack?.id ?? [])
    );
    for (const playedId of manager.getPlayedTrackIds()) {
      existingTrackIds.add(playedId);
    }
    if (externalExcludedTrackIds) {
      for (const trackId of externalExcludedTrackIds) {
        existingTrackIds.add(trackId);
      }
    }
    const candidateTrackIds = new Set<string>();
    const genreBuckets: Track[][] = [];

    for (const genre of settings.genres) {
      const bucket: Track[] = [];
      const queries = this.buildGenreQueries(genre);

      for (const query of queries) {
        let tracks: Track[] = [];
        try {
          tracks = await provider.searchTracks(query, perGenreLimit);
        } catch (error) {
          console.error(`[PartyRegistry] Genre search failed (${query}):`, error);
          continue;
        }

        for (const track of tracks) {
          if (!track?.id || !track?.uri) continue;
          if (!settings.allowExplicit && track.explicit) continue;
          if (existingTrackIds.has(track.id)) continue;
          if (candidateTrackIds.has(track.id)) continue;

          candidateTrackIds.add(track.id);
          bucket.push(track);
        }
      }

      genreBuckets.push(bucket);
    }

    const mixedCandidates: Track[] = [];
    let index = 0;
    while (mixedCandidates.length < desiredCount) {
      let foundInRound = false;
      for (const bucket of genreBuckets) {
        if (index < bucket.length) {
          mixedCandidates.push(bucket[index]);
          foundInRound = true;
          if (mixedCandidates.length >= desiredCount) break;
        }
      }
      if (!foundInRound) break;
      index += 1;
    }

    return mixedCandidates;
  }

  private async seedQueueFromSettings(
    partyId: string,
    settings: PartySettings
  ): Promise<number> {
    const manager = this.parties.get(partyId);
    if (!manager) return 0;

    const targetQueueSize = Math.max(5, settings.targetQueueSize);
    const desiredQueueSize = settings.autoFillEnabled
      ? targetQueueSize
      : Math.min(targetQueueSize, Math.max(10, settings.genres.length * 4));
    const currentSize = manager.getState().queue.length;
    const missing = Math.max(0, desiredQueueSize - currentSize);
    if (missing === 0) return 0;

    const seedTracks = await this.collectGenreTracks(partyId, settings, missing);
    if (seedTracks.length === 0) return 0;

    await manager.addTracks(seedTracks);
    return seedTracks.length;
  }

  private async runAutoFillCycle(partyId: string) {
    if (this.autoFillRunning.has(partyId)) return;
    this.autoFillRunning.add(partyId);

    try {
      const manager = this.parties.get(partyId);
      const meta = this.partyMeta.get(partyId);
      if (!manager || !meta) return;

      const settings = sanitizePartySettings(meta.settings ?? DEFAULT_PARTY_SETTINGS);
      if (!settings.autoFillEnabled || settings.genres.length === 0) return;
      if (!manager.getState().isActive) return;

      const state = manager.getState();
      const targetQueueSize = Math.max(5, settings.targetQueueSize);

      if (state.queue.length < targetQueueSize) {
        const toAdd = Math.min(2, targetQueueSize - state.queue.length);
        if (toAdd <= 0) return;
        const refillTracks = await this.collectGenreTracks(partyId, settings, toAdd);
        if (refillTracks.length > 0) {
          await manager.addTracks(refillTracks);
          await this.persistParty(partyId);
        }
        return;
      }

      const replacementCount = 2;
      const secondsSinceLastVote = Math.floor((Date.now() - manager.getLastVoteAt()) / 1000);
      if (secondsSinceLastVote < 20) {
        return;
      }
      const replacementTracks = await this.collectGenreTracks(
        partyId,
        settings,
        replacementCount
      );
      if (replacementTracks.length < replacementCount) return;

      const removed = manager.removeTracksFromTail(replacementCount, {
        protectNext: true,
        protectTopN: 10,
      });
      if (removed.length < replacementCount) return;

      await manager.addTracks(replacementTracks.slice(0, replacementCount));
      await this.persistParty(partyId);
    } catch (error) {
      console.error(`[PartyRegistry] Auto-Fill cycle failed for ${partyId}:`, error);
    } finally {
      this.autoFillRunning.delete(partyId);
    }
  }

  async createParty(input?: {
    providerName?: string;
    name?: string;
    settings?: PartySettings;
  }) {
    await this.ensureInitialized();

    const partyId = crypto.randomUUID();
    const providerName = input?.providerName || this.defaultProvider;
    const name = input?.name?.trim() || `Party ${new Date().toLocaleString("de-DE")}`;
    const settings = sanitizePartySettings(input?.settings ?? DEFAULT_PARTY_SETTINGS);

    const provider = getProvider(providerName);
    const manager = new PartyManager(partyId, provider);
    this.parties.set(partyId, manager);

    const now = new Date().toISOString();
    const metadata: PartyMetadata = {
      partyId,
      name,
      providerName,
      isActive: false,
      createdAt: now,
      updatedAt: now,
      settings,
    };
    this.partyMeta.set(partyId, metadata);
    manager.setFadeDurationSeconds(settings.fadeSeconds);
    this.attachPersistence(manager, partyId);

    await this.store.createParty({
      partyId,
      name,
      providerName,
      settings,
      snapshot: {
        state: manager.getState(),
        votedByClient: manager.getVotedByClient(),
      },
    });

    await this.activateParty(partyId);
    await this.seedQueueFromSettings(partyId, settings);
    await this.persistParty(partyId);

    return {
      partyId,
      manager,
      metadata: this.partyMeta.get(partyId)!,
    };
  }

  async listParties() {
    await this.ensureInitialized();
    const latest = await this.store.listParties();
    for (const meta of latest) {
      this.partyMeta.set(meta.partyId, meta);
    }
    return latest;
  }

  async getParty(partyId: string) {
    await this.ensureInitialized();

    const cached = this.parties.get(partyId);
    if (cached) return cached;

    const persisted = await this.store.getPartyById(partyId);
    if (!persisted) return undefined;

    const provider = getProvider(persisted.providerName || this.defaultProvider);
    const manager = new PartyManager(
      persisted.partyId,
      provider,
      persisted.snapshot.state,
      persisted.snapshot.votedByClient
    );

    this.parties.set(partyId, manager);
    this.partyMeta.set(partyId, {
      partyId: persisted.partyId,
      name: persisted.name,
      providerName: persisted.providerName,
      isActive: persisted.isActive,
      createdAt: persisted.createdAt,
      updatedAt: persisted.updatedAt,
      settings: sanitizePartySettings(persisted.settings ?? DEFAULT_PARTY_SETTINGS),
    });
    manager.setFadeDurationSeconds(
      sanitizePartySettings(persisted.settings ?? DEFAULT_PARTY_SETTINGS).fadeSeconds
    );
    this.attachPersistence(manager, partyId);

    if (persisted.snapshot.state?.isActive) {
      void manager.startParty();
    }

    return manager;
  }

  async getPartyMetadata(partyId: string) {
    await this.ensureInitialized();
    const cached = this.partyMeta.get(partyId);
    if (cached) return cached;

    const persisted = await this.store.getPartyById(partyId);
    if (!persisted) return null;

    const metadata: PartyMetadata = {
      partyId: persisted.partyId,
      name: persisted.name,
      providerName: persisted.providerName,
      isActive: persisted.isActive,
      createdAt: persisted.createdAt,
      updatedAt: persisted.updatedAt,
      settings: sanitizePartySettings(persisted.settings ?? DEFAULT_PARTY_SETTINGS),
    };
    this.partyMeta.set(partyId, metadata);
    return metadata;
  }

  async removeParty(partyId: string) {
    await this.ensureInitialized();

    const party = await this.getParty(partyId);
    if (party) {
      party.stopParty();
    }

    const timer = this.persistTimers.get(partyId);
    if (timer) {
      clearTimeout(timer);
      this.persistTimers.delete(partyId);
    }
    const autoFillTimer = this.autoFillTimers.get(partyId);
    if (autoFillTimer) {
      clearInterval(autoFillTimer);
      this.autoFillTimers.delete(partyId);
    }
    this.autoFillRunning.delete(partyId);

    this.parties.delete(partyId);
    this.partyMeta.delete(partyId);
    await this.store.deleteParty(partyId);
  }

  async updatePartySettings(partyId: string, settingsInput: PartySettings) {
    await this.ensureInitialized();

    const manager = await this.getParty(partyId);
    if (!manager) {
      throw new Error(`Party mit ID ${partyId} nicht gefunden`);
    }

    const existingMeta = this.partyMeta.get(partyId);
    if (!existingMeta) {
      throw new Error(`Party-Metadaten für ${partyId} nicht gefunden`);
    }

    const settings = sanitizePartySettings(settingsInput);
    this.partyMeta.set(partyId, {
      ...existingMeta,
      settings,
      updatedAt: new Date().toISOString(),
    });
    manager.setFadeDurationSeconds(settings.fadeSeconds);

    const addedCount = await this.seedQueueFromSettings(partyId, settings);
    await this.persistParty(partyId);
    return {
      metadata: this.partyMeta.get(partyId)!,
      queue: manager.getState().queue,
      addedCount,
    };
  }

  async activateParty(partyId: string) {
    await this.ensureInitialized();

    const target = await this.getParty(partyId);
    if (!target) {
      throw new Error(`Party mit ID ${partyId} nicht gefunden`);
    }

    for (const [id, party] of this.parties.entries()) {
      if (id === partyId) continue;
      if (party.getState().isActive) {
        party.stopParty();
      }
      const existingMeta = this.partyMeta.get(id);
      if (existingMeta) {
        this.partyMeta.set(id, {
          ...existingMeta,
          isActive: false,
          updatedAt: new Date().toISOString(),
        });
      }
    }

    if (!target.getState().isActive) {
      await target.startParty();
    }

    const meta = this.partyMeta.get(partyId);
    if (meta) {
      this.partyMeta.set(partyId, {
        ...meta,
        isActive: true,
        updatedAt: new Date().toISOString(),
      });
    }

    await this.store.setActiveParty(partyId);
    await this.persistParty(partyId);

    return target;
  }

  async getActiveParty() {
    await this.ensureInitialized();

    for (const [partyId, manager] of this.parties.entries()) {
      if (manager.getState().isActive) {
        return { partyId, manager };
      }
    }

    const persistedActive = await this.store.getActiveParty();
    if (!persistedActive) return null;

    const manager = await this.getParty(persistedActive.partyId);
    if (!manager) return null;

    if (!manager.getState().isActive) {
      await this.activateParty(persistedActive.partyId);
    }

    return { partyId: persistedActive.partyId, manager };
  }
}

export const partyRegistry = PartyRegistry.getInstance();
