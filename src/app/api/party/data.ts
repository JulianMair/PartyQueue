
export interface Party {
  id: string;
  hostId: string;
  guests: string[];
  votes: Record<string, number>; // Song URI -> Stimmen
}

export const parties = new Map<string, Party>();
