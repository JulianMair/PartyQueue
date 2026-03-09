// src/app/lib/party/PartyRegistry.ts
import { PartyManager } from "./PartyManager";
import { getProvider } from "../providers/factory";
import { PartyStore, type PartyMetadata } from "./partyStore";

class PartyRegistry {
  private static instance: PartyRegistry;
  private readonly parties: Map<string, PartyManager> = new Map();
  private readonly partyMeta: Map<string, PartyMetadata> = new Map();
  private readonly store = new PartyStore();
  private readonly defaultProvider = "spotify";
  private readonly persistTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
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
      });

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
    });

    this.partyMeta.set(partyId, {
      ...meta,
      isActive: snapshot.state.isActive,
      updatedAt: new Date().toISOString(),
    });
  }

  async createParty(input?: { providerName?: string; name?: string }) {
    await this.ensureInitialized();

    const partyId = crypto.randomUUID();
    const providerName = input?.providerName || this.defaultProvider;
    const name = input?.name?.trim() || `Party ${new Date().toLocaleString("de-DE")}`;

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
    };
    this.partyMeta.set(partyId, metadata);
    this.attachPersistence(manager, partyId);

    await this.store.createParty({
      partyId,
      name,
      providerName,
      snapshot: {
        state: manager.getState(),
        votedByClient: manager.getVotedByClient(),
      },
    });

    await this.activateParty(partyId);

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
    });
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

    this.parties.delete(partyId);
    this.partyMeta.delete(partyId);
    await this.store.deleteParty(partyId);
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
