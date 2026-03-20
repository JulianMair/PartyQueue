import { getDb } from "@/app/lib/db/mongodb";
import type { PartyState } from "./PartyManager";
import type { PartySettings } from "./settings";
import { DEFAULT_PARTY_SETTINGS, sanitizePartySettings } from "./settings";

export interface PartyPersistenceSnapshot {
  state: PartyState;
  votedByClient: Record<string, string[]>;
}

export interface PartyMetadata {
  partyId: string;
  name: string;
  providerName: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  settings: PartySettings;
}

interface PartyDocument {
  partyId: string;
  name: string;
  providerName: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  settings?: PartySettings;
  state: PartyState;
  votedByClient: Record<string, string[]>;
}

const COLLECTION = "parties";

export class PartyStore {
  private async collection() {
    const db = await getDb();
    const collection = db.collection<PartyDocument>(COLLECTION);
    await collection.createIndex({ partyId: 1 }, { unique: true });
    await collection.createIndex({ updatedAt: -1 });
    return collection;
  }

  async createParty(input: {
    partyId: string;
    name: string;
    providerName: string;
    settings: PartySettings;
    snapshot: PartyPersistenceSnapshot;
  }) {
    const collection = await this.collection();
    const now = new Date();

    await collection.insertOne({
      partyId: input.partyId,
      name: input.name,
      providerName: input.providerName,
      isActive: input.snapshot.state.isActive,
      createdAt: now,
      updatedAt: now,
      settings: input.settings,
      state: input.snapshot.state,
      votedByClient: input.snapshot.votedByClient,
    });
  }

  async updateParty(
    partyId: string,
    input: {
      snapshot: PartyPersistenceSnapshot;
      name?: string;
      providerName?: string;
      settings?: PartySettings;
    }
  ) {
    const collection = await this.collection();
    const now = new Date();

    await collection.updateOne(
      { partyId },
      {
        $set: {
          state: input.snapshot.state,
          votedByClient: input.snapshot.votedByClient,
          isActive: input.snapshot.state.isActive,
          updatedAt: now,
          ...(input.name ? { name: input.name } : {}),
          ...(input.providerName ? { providerName: input.providerName } : {}),
          ...(input.settings ? { settings: input.settings } : {}),
        },
      },
      { upsert: false }
    );
  }

  async setActiveParty(partyId: string) {
    const collection = await this.collection();
    const now = new Date();

    await collection.updateMany(
      { partyId: { $ne: partyId }, isActive: true },
      {
        $set: {
          isActive: false,
          "state.isActive": false,
          updatedAt: now,
        },
      }
    );

    await collection.updateOne(
      { partyId },
      {
        $set: {
          isActive: true,
          "state.isActive": true,
          updatedAt: now,
        },
      }
    );
  }

  async listParties(): Promise<PartyMetadata[]> {
    const collection = await this.collection();
    const docs = await collection.find({}, { projection: { _id: 0 } }).sort({ updatedAt: -1 }).toArray();

    return docs.map((doc: PartyDocument) => ({
      partyId: doc.partyId,
      name: doc.name,
      providerName: doc.providerName,
      isActive: doc.isActive,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
      settings: sanitizePartySettings(doc.settings ?? DEFAULT_PARTY_SETTINGS),
    }));
  }

  async getPartyById(partyId: string): Promise<(PartyMetadata & { snapshot: PartyPersistenceSnapshot }) | null> {
    const collection = await this.collection();
    const doc = await collection.findOne({ partyId });
    if (!doc) return null;

    return {
      partyId: doc.partyId,
      name: doc.name,
      providerName: doc.providerName,
      isActive: doc.isActive,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
      settings: sanitizePartySettings(doc.settings ?? DEFAULT_PARTY_SETTINGS),
      snapshot: {
        state: doc.state,
        votedByClient: doc.votedByClient || {},
      },
    };
  }

  async getActiveParty(): Promise<(PartyMetadata & { snapshot: PartyPersistenceSnapshot }) | null> {
    const collection = await this.collection();
    const doc = await collection.findOne({ isActive: true }, { sort: { updatedAt: -1 } });
    if (!doc) return null;

    return {
      partyId: doc.partyId,
      name: doc.name,
      providerName: doc.providerName,
      isActive: doc.isActive,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
      settings: sanitizePartySettings(doc.settings ?? DEFAULT_PARTY_SETTINGS),
      snapshot: {
        state: doc.state,
        votedByClient: doc.votedByClient || {},
      },
    };
  }

  async deleteParty(partyId: string) {
    const collection = await this.collection();
    await collection.deleteOne({ partyId });
  }

  async loadAllParties() {
    const collection = await this.collection();
    const docs = await collection.find({}).toArray();

    return docs.map((doc: PartyDocument) => ({
      partyId: doc.partyId,
      name: doc.name,
      providerName: doc.providerName,
      isActive: doc.isActive,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
      settings: sanitizePartySettings(doc.settings ?? DEFAULT_PARTY_SETTINGS),
      snapshot: {
        state: doc.state,
        votedByClient: doc.votedByClient || {},
      },
    }));
  }
}
