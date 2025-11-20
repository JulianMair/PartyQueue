// src/app/lib/party/PartyRegistry.ts
import { PartyManager } from "./PartyManager";
import { getProvider } from "../providers/factory";

class PartyRegistry {
  private static instance: PartyRegistry;
  private parties: Map<string, PartyManager> = new Map();

  private constructor() {}

  static getInstance() {
    if (!PartyRegistry.instance) {
      PartyRegistry.instance = new PartyRegistry();
    }
    return PartyRegistry.instance;
  }

  createParty(partyId: string, providerName: string) {
    const provider = getProvider(providerName);
    const manager = new PartyManager(partyId, provider);
    this.parties.set(partyId, manager);
    return manager;
  }

  getParty(partyId: string) {
    return this.parties.get(partyId);
  }

  removeParty(partyId: string) {
    this.parties.delete(partyId);
  }

  startParty(partyId: string) {
    const party = this.getParty(partyId);
    if (party) {
      return party.startParty();
    }
    throw new Error(`Party mit ID ${partyId} nicht gefunden`);
  }
}

export const partyRegistry = PartyRegistry.getInstance();
