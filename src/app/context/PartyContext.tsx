"use client";

import { createContext, useContext, useState } from "react";

interface PartyContextValue {
  partyId: string | null;
  setPartyId: (id: string | null) => void;
  isPartyActive: boolean;
  setIsPartyActive: (v: boolean) => void;
}

const PartyContext = createContext<PartyContextValue | undefined>(undefined);

export function PartyProvider({ children }: { children: React.ReactNode }) {
  const [partyId, setPartyId] = useState<string | null>(null);
  const [isPartyActive, setIsPartyActive] = useState(false);

  return (
    <PartyContext.Provider value={{ partyId, setPartyId, isPartyActive, setIsPartyActive }}>
      {children}
    </PartyContext.Provider>
  );
}

export function useParty() {
  const ctx = useContext(PartyContext);
  if (!ctx) throw new Error("useParty muss innerhalb eines <PartyProvider> verwendet werden");
  return ctx;
}
