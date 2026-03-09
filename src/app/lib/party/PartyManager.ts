// src/app/lib/party/PartyManager.ts
import EventEmitter from "events";
import { MusicProvider, Track, PartyTrack } from "../providers/types";

export interface PartyState {
  id: string;
  queue: PartyTrack[];
  currentTrack?: PartyTrack;
  isActive: boolean;
}

export class PartyManager extends EventEmitter {
  private state: PartyState;
  private provider: MusicProvider;
  private syncInterval: NodeJS.Timeout | null = null;
  private voted: Map<string, Set<string>> = new Map();


  constructor(
    partyId: string,
    provider: MusicProvider,
    initialState?: Partial<PartyState>,
    initialVotedByClient?: Record<string, string[]>
  ) {
    super();
    this.state = {
      id: partyId,
      queue: initialState?.queue ?? [],
      currentTrack: initialState?.currentTrack,
      isActive: initialState?.isActive ?? false,
    };
    this.provider = provider;
    if (initialVotedByClient) {
      this.voted = new Map(
        Object.entries(initialVotedByClient).map(([clientId, trackIds]) => [
          clientId,
          new Set(trackIds),
        ])
      );
    }
  }

  getState() {
    return this.state;
  }

  getVotedByClient() {
    return Object.fromEntries(
      Array.from(this.voted.entries()).map(([clientId, tracks]) => [
        clientId,
        Array.from(tracks),
      ])
    );
  }

  private toPartyTrack(track: Track): PartyTrack {
    return {
      ...track,
      votes: 0,
      addedAt: Date.now(),
    };
  }

  async startParty() {
    this.state.isActive = true;
    this.startSync();
    this.emit("partyStarted", this.state);
    this.emit("stateChanged", this.state);
    console.log(`[PartyManager] Party ${this.state.id} gestartet`);
  }

  stopParty() {
    this.state.isActive = false;
    if (this.syncInterval) clearInterval(this.syncInterval);
    this.syncInterval = null;
    this.emit("stateChanged", this.state);
    console.log(`[PartyManager] Party ${this.state.id} gestoppt`);
  }

  /** SONG ZUR PARTYQUEUE HINZUFÜGEN (nur intern!) */
  async addTrack(track: Track) {
    await this.addTracks([track]);
  }

  /** MEHRERE SONGS ZUR PARTYQUEUE HINZUFÜGEN (nur intern!) */
  async addTracks(tracks: Track[]) {
    const validTracks = tracks.filter((track) => track?.id && track?.uri);
    if (validTracks.length === 0) return;

    const now = Date.now();
    const partyTracks: PartyTrack[] = validTracks.map((track, index) => ({
      ...this.toPartyTrack(track),
      addedAt: now + index,
    }));

    this.state.queue.push(...partyTracks);
    this.sortQueue();
    this.emit("queueUpdated", this.state.queue);
    this.emit("stateChanged", this.state);

    console.log(`[PartyManager] ${partyTracks.length} Tracks hinzugefügt`);
  }

  /** GANZE PLAYLIST ÜBER PROVIDER EINLESEN UND INTERN EINREIHEN */
  async addPlaylist(playlistId: string) {
    const allTracks: Track[] = [];
    const limit = 100;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const { tracks, next } = await this.provider.getPlaylistTracks(
        playlistId,
        offset,
        limit
      );

      if (tracks.length === 0) break;

      allTracks.push(...tracks);
      offset += limit;
      hasMore = Boolean(next);
    }

    await this.addTracks(allTracks);
    return allTracks.length;
  }

  /** VOTING → beeinflusst NUR die interne Queue */
async vote(trackId: string, clientId: string) {
  // Falls es den client noch nicht gibt → Set anlegen
  if (!this.voted.has(clientId)) {
    this.voted.set(clientId, new Set());
  }

  const votedTracks = this.voted.get(clientId)!;

  // Wenn dieses Gerät schon für diesen Track gevotet hat → abbrechen
  if (votedTracks.has(trackId)) {
    console.log(`Client ${clientId} hat Track ${trackId} bereits gevotet`);
    return;
  }

  // Markiere den Track für diesen Client als gevotet
  votedTracks.add(trackId);

  // Punkte erhöhen
  const track = this.state.queue.find((t) => t.id === trackId);
  if (!track) return;

  track.votes++;
  this.sortQueue();
  this.emit("queueUpdated", this.state.queue);
  this.emit("stateChanged", this.state);

  console.log(`Vote akzeptiert: ${track.name} (${track.votes})`);
}


  /** Intern: sortiere Queue nach Votes + Zeit */
  private sortQueue() {
    this.state.queue.sort(
      (a, b) => b.votes - a.votes || a.addedAt - b.addedAt
    );
  }

  /** Starte Spotify-Sync (polling) */
  private startSync() {
    if (this.syncInterval) clearInterval(this.syncInterval);

    this.syncInterval = setInterval(() => this.syncWithSpotify(), 1500);
    console.log(`[PartyManager] Sync gestartet`);
  }

  /** STARTE DEN NÄCHSTEN TRACK SOFORT */
  public async playNextTrack() {
    if (this.state.queue.length === 0) return;

    const next = this.state.queue.shift()!;
    
    this.state.currentTrack = next;

    this.voted.forEach((tracks) => tracks.delete(next.id));

    await this.provider.play(next.uri);
    this.emit("trackStarted", next);
    this.emit("queueUpdated", this.state.queue);
    this.emit("stateChanged", this.state);

    console.log(`[PartyManager] Spiele nächsten Track: ${next.name}`);
  }

  /** HAUPT-SYNC LOGIK */
  private async syncWithSpotify() {
    try {
      const playback = await this.provider.getCurrentPlayback();
      if (!playback) return;

      const spotifyItem = playback.item ?? null;
      const isPlaying = playback.is_playing ?? false;

      // FALL 1: Spotify spielt GAR NICHT → wir starten wieder
      /**
        if (!isPlaying || !spotifyItem) {
          console.log("[PartyManager] Kein Song läuft → starte nächsten");
          await this.playNextTrack();
          return;
        }
      */

      const spotifyUri = spotifyItem.uri;
      const currentUri = this.state.currentTrack?.uri;

      // FALL 2: Spotify hat auf einen neuen Song gewechselt
      if (spotifyUri !== currentUri) {
        console.log(`[PartyManager] Trackwechsel erkannt: ${spotifyItem.name}`);

        const newTrack: PartyTrack = {
          id: spotifyItem.id,
          uri: spotifyItem.uri,
          name: spotifyItem.name,
          artist: spotifyItem.artists.map((a: any) => a.name).join(", "),
          albumArt: spotifyItem.album?.images?.[0]?.url,
          durationMs: spotifyItem.duration_ms,
          votes: 0,
          addedAt: Date.now(),
        };

        this.state.currentTrack = newTrack;

        // Entferne aus unserer PartyQueue, falls er drin war
        this.state.queue = this.state.queue.filter(
          (t) => t.uri !== spotifyUri
        );

        this.emit("trackStarted", newTrack);
        this.emit("queueUpdated", this.state.queue);
        this.emit("stateChanged", this.state);
      }

      // FALL 3: Ist der Song bald vorbei? (letzte 5 Sekunden)
      const progress = playback.progress_ms ?? 0;
      const duration = spotifyItem.duration_ms ?? 0;
      const remaining = duration - progress;

      if (remaining < 1500) {
        console.log("[PartyManager] Song endet bald → bereite nächsten vor");

        await this.playNextTrack();
      }
    } catch (err) {
      console.error("[PartyManager] Sync-Fehler:", err);
    }
  }
}
