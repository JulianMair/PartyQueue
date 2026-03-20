// src/app/lib/party/PartyManager.ts
import EventEmitter from "events";
import { MusicProvider, Track, PartyTrack } from "../providers/types";

export interface PartyState {
  id: string;
  queue: PartyTrack[];
  currentTrack?: PartyTrack;
  isActive: boolean;
  version: number;
}

export type VoteResultStatus =
  | "ok"
  | "duplicate"
  | "not_found"
  | "removed"
  | "not_voted";

export interface VoteResult {
  status: VoteResultStatus;
  top10: PartyTrack[];
  version: number;
}

export class PartyManager extends EventEmitter {
  private state: PartyState;
  private provider: MusicProvider;
  private syncInterval: NodeJS.Timeout | null = null;
  private voted: Map<string, Set<string>> = new Map();
  private playedTrackIds: Set<string> = new Set();
  private fadeDurationSeconds = 0;
  private transitionInProgress = false;
  private lastVoteAt = 0;


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
      version: initialState?.version ?? 0,
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
    if (initialState?.currentTrack?.id) {
      this.playedTrackIds.add(initialState.currentTrack.id);
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

  getPlayedTrackIds() {
    return Array.from(this.playedTrackIds);
  }

  getLastVoteAt() {
    return this.lastVoteAt;
  }

  setFadeDurationSeconds(seconds: number) {
    this.fadeDurationSeconds = Math.min(12, Math.max(0, Number(seconds) || 0));
  }

  private toPartyTrack(track: Track): PartyTrack {
    return {
      ...track,
      votes: 0,
      addedAt: Date.now(),
    };
  }

  private bumpVersion() {
    this.state.version += 1;
  }

  private getTop10() {
    return this.state.queue.slice(0, 10);
  }

  private trackShouldComeBefore(a: PartyTrack, b: PartyTrack) {
    return a.votes > b.votes || (a.votes === b.votes && a.addedAt < b.addedAt);
  }

  async startParty() {
    this.state.isActive = true;
    this.startSync();
    this.bumpVersion();
    this.emit("partyStarted", this.state);
    this.emit("stateChanged", this.state);
    console.log(`[PartyManager] Party ${this.state.id} gestartet`);
  }

  stopParty() {
    this.state.isActive = false;
    if (this.syncInterval) clearInterval(this.syncInterval);
    this.syncInterval = null;
    this.bumpVersion();
    this.emit("stateChanged", this.state);
    console.log(`[PartyManager] Party ${this.state.id} gestoppt`);
  }

  /** SONG ZUR PARTYQUEUE HINZUFÜGEN (nur intern!) */
  async addTrack(track: Track) {
    await this.addTracks([track]);
  }

  /** MEHRERE SONGS ZUR PARTYQUEUE HINZUFÜGEN (nur intern!) */
  async addTracks(tracks: Track[]) {
    const existingIds = new Set(
      this.state.queue
        .map((track) => track.id)
        .concat(this.state.currentTrack?.id ?? [])
    );
    const batchIds = new Set<string>();
    const validTracks = tracks.filter((track) => {
      if (!track?.id || !track?.uri) return false;
      if (existingIds.has(track.id)) return false;
      if (batchIds.has(track.id)) return false;
      batchIds.add(track.id);
      return true;
    });
    if (validTracks.length === 0) return;

    const now = Date.now();
    const partyTracks: PartyTrack[] = validTracks.map((track, index) => ({
      ...this.toPartyTrack(track),
      addedAt: now + index,
    }));

    this.state.queue.push(...partyTracks);
    this.bumpVersion();
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

  /** HOST: Queue-Eintrag verschieben */
  moveTrack(fromIndex: number, toIndex: number) {
    const lastIndex = this.state.queue.length - 1;
    if (lastIndex < 0) return;
    if (
      fromIndex < 0 ||
      fromIndex > lastIndex ||
      toIndex < 0 ||
      toIndex > lastIndex ||
      fromIndex === toIndex
    ) {
      return;
    }

    const [moved] = this.state.queue.splice(fromIndex, 1);
    this.state.queue.splice(toIndex, 0, moved);

    this.bumpVersion();
    this.emit("queueUpdated", this.state.queue);
    this.emit("stateChanged", this.state);
  }

  /** HOST: Queue-Eintrag löschen */
  removeTrackAt(index: number) {
    if (index < 0 || index >= this.state.queue.length) return;

    const [removed] = this.state.queue.splice(index, 1);
    if (removed) {
      this.voted.forEach((tracks) => tracks.delete(removed.id));
    }

    this.bumpVersion();
    this.emit("queueUpdated", this.state.queue);
    this.emit("stateChanged", this.state);
  }

  removeLowestRankedTracks(
    count: number,
    options?: { protectNext?: boolean; protectTopN?: number; onlyZeroVotes?: boolean }
  ) {
    if (count <= 0 || this.state.queue.length === 0) return [] as PartyTrack[];

    const protectNext = options?.protectNext ?? true;
    const protectTopN = Math.max(0, options?.protectTopN ?? 0);
    const startIndex = Math.max(protectNext ? 1 : 0, protectTopN);
    if (startIndex >= this.state.queue.length) return [] as PartyTrack[];

    const removable = this.state.queue
      .map((track, index) => ({ track, index }))
      .filter(({ track, index }) => {
        if (index < startIndex) return false;
        if (options?.onlyZeroVotes && track.votes > 0) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.track.votes !== b.track.votes) return a.track.votes - b.track.votes;
        if (a.track.addedAt !== b.track.addedAt) return a.track.addedAt - b.track.addedAt;
        return b.index - a.index;
      })
      .slice(0, count);

    if (removable.length === 0) return [] as PartyTrack[];

    const indicesToRemove = removable.map((item) => item.index).sort((a, b) => b - a);
    const removed: PartyTrack[] = [];
    for (const index of indicesToRemove) {
      const [track] = this.state.queue.splice(index, 1);
      if (track) {
        removed.push(track);
        this.voted.forEach((tracks) => tracks.delete(track.id));
      }
    }

    this.bumpVersion();
    this.emit("queueUpdated", this.state.queue);
    this.emit("stateChanged", this.state);

    return removed;
  }

  removeTracksFromTail(
    count: number,
    options?: { protectNext?: boolean; protectTopN?: number }
  ) {
    if (count <= 0 || this.state.queue.length === 0) return [] as PartyTrack[];

    const protectNext = options?.protectNext ?? true;
    const protectTopN = Math.max(0, options?.protectTopN ?? 0);
    const minProtectedIndex = Math.max(protectNext ? 1 : 0, protectTopN);
    if (minProtectedIndex >= this.state.queue.length) return [] as PartyTrack[];

    const removed: PartyTrack[] = [];
    for (let index = this.state.queue.length - 1; index >= minProtectedIndex; index -= 1) {
      const [track] = this.state.queue.splice(index, 1);
      if (track) {
        removed.push(track);
        this.voted.forEach((tracks) => tracks.delete(track.id));
      }
      if (removed.length >= count) break;
    }

    if (removed.length === 0) return removed;

    this.bumpVersion();
    this.emit("queueUpdated", this.state.queue);
    this.emit("stateChanged", this.state);

    return removed;
  }

  /** VOTING → beeinflusst NUR die interne Queue */
  vote(trackId: string, clientId: string): VoteResult {
    if (!this.voted.has(clientId)) {
      this.voted.set(clientId, new Set());
    }

    const votedTracks = this.voted.get(clientId)!;
    if (votedTracks.has(trackId)) {
      return {
        status: "duplicate",
        top10: this.getTop10(),
        version: this.state.version,
      };
    }

    const index = this.state.queue.findIndex((t) => t.id === trackId);
    if (index < 0) {
      return {
        status: "not_found",
        top10: this.getTop10(),
        version: this.state.version,
      };
    }

    votedTracks.add(trackId);

    this.state.queue[index].votes += 1;
    this.lastVoteAt = Date.now();

    // Vote erhöht nur einen Track, daher reicht lokales Hochziehen statt kompletter Sort.
    let currentIndex = index;
    while (
      currentIndex > 0 &&
      this.trackShouldComeBefore(
        this.state.queue[currentIndex],
        this.state.queue[currentIndex - 1]
      )
    ) {
      const tmp = this.state.queue[currentIndex - 1];
      this.state.queue[currentIndex - 1] = this.state.queue[currentIndex];
      this.state.queue[currentIndex] = tmp;
      currentIndex -= 1;
    }

    this.bumpVersion();
    this.emit("queueUpdated", this.state.queue);
    this.emit("stateChanged", this.state);

    console.log(`Vote akzeptiert: ${trackId}`);
    return {
      status: "ok",
      top10: this.getTop10(),
      version: this.state.version,
    };
  }

  unvote(trackId: string, clientId: string): VoteResult {
    const votedTracks = this.voted.get(clientId);
    if (!votedTracks || !votedTracks.has(trackId)) {
      return {
        status: "not_voted",
        top10: this.getTop10(),
        version: this.state.version,
      };
    }

    const index = this.state.queue.findIndex((t) => t.id === trackId);
    if (index < 0) {
      votedTracks.delete(trackId);
      return {
        status: "not_found",
        top10: this.getTop10(),
        version: this.state.version,
      };
    }

    const track = this.state.queue[index];
    track.votes = Math.max(0, track.votes - 1);
    votedTracks.delete(trackId);
    this.lastVoteAt = Date.now();

    // Bei weniger Votes kann der Track nach unten rutschen.
    let currentIndex = index;
    while (
      currentIndex < this.state.queue.length - 1 &&
      this.trackShouldComeBefore(
        this.state.queue[currentIndex + 1],
        this.state.queue[currentIndex]
      )
    ) {
      const tmp = this.state.queue[currentIndex + 1];
      this.state.queue[currentIndex + 1] = this.state.queue[currentIndex];
      this.state.queue[currentIndex] = tmp;
      currentIndex += 1;
    }

    this.bumpVersion();
    this.emit("queueUpdated", this.state.queue);
    this.emit("stateChanged", this.state);

    return {
      status: "removed",
      top10: this.getTop10(),
      version: this.state.version,
    };
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
  public async playNextTrack(applyFade = true) {
    if (this.state.queue.length === 0 || this.transitionInProgress) return;
    this.transitionInProgress = true;

    const playNextInternal = async () => {
      if (this.state.queue.length === 0) return false;
      const next = this.state.queue[0];
      if (!next) return false;

      try {
        await this.provider.play(next.uri);
      } catch (err) {
        console.error("[PartyManager] Konnte nächsten Track nicht starten:", err);
        return false;
      }

      this.state.queue.shift();
      this.state.currentTrack = next;
      this.playedTrackIds.add(next.id);
      this.voted.forEach((tracks) => tracks.delete(next.id));

      this.bumpVersion();
      this.emit("trackStarted", next);
      this.emit("queueUpdated", this.state.queue);
      this.emit("stateChanged", this.state);

      console.log(`[PartyManager] Spiele nächsten Track: ${next.name}`);
      return true;
    };

    const wait = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));

    const safeSetVolume = async (volumePercent: number) => {
      try {
        await this.provider.setVolume(volumePercent);
        return true;
      } catch (err) {
        console.error("[PartyManager] Konnte Lautstärke nicht setzen:", err);
        return false;
      }
    };

    try {
      const totalFadeMs = applyFade
        ? Math.round(this.fadeDurationSeconds * 1000)
        : 0;
      const halfFadeMs = Math.floor(totalFadeMs / 2);
      if (totalFadeMs <= 0) {
        await playNextInternal();
        return;
      }

      let playback: any = null;
      try {
        playback = await this.provider.getCurrentPlayback();
      } catch (err) {
        console.error("[PartyManager] Playback für Fade konnte nicht geladen werden:", err);
      }
      const currentVolume =
        typeof playback?.device?.volume_percent === "number"
          ? playback.device.volume_percent
          : null;

      if (currentVolume === null) {
        await playNextInternal();
        return;
      }

      const steps = Math.max(3, Math.min(12, Math.floor(this.fadeDurationSeconds * 4)));
      const stepDelayMs = Math.max(60, Math.floor(halfFadeMs / steps));
      let fadeOutWorked = true;

      for (let step = steps - 1; step >= 0; step -= 1) {
        const volume = Math.round((currentVolume * step) / steps);
        const ok = await safeSetVolume(volume);
        if (!ok) {
          fadeOutWorked = false;
          break;
        }
        await wait(stepDelayMs);
      }

      const didStartNext = await playNextInternal();
      if (!didStartNext) {
        await safeSetVolume(currentVolume);
        return;
      }

      if (!fadeOutWorked) {
        await safeSetVolume(currentVolume);
        return;
      }

      for (let step = 1; step <= steps; step += 1) {
        const volume = Math.round((currentVolume * step) / steps);
        const ok = await safeSetVolume(volume);
        if (!ok) break;
        await wait(stepDelayMs);
      }
    } finally {
      this.transitionInProgress = false;
    }
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

      if (!spotifyItem) return;

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
        if (newTrack.id) {
          this.playedTrackIds.add(newTrack.id);
        }

        // Entferne aus unserer PartyQueue, falls er drin war
        this.state.queue = this.state.queue.filter(
          (t) => t.uri !== spotifyUri
        );

        this.bumpVersion();
        this.emit("trackStarted", newTrack);
        this.emit("queueUpdated", this.state.queue);
        this.emit("stateChanged", this.state);
      }

      // FALL 3: Ist der Song bald vorbei? (letzte 5 Sekunden)
      const progress = playback.progress_ms ?? 0;
      const duration = spotifyItem.duration_ms ?? 0;
      const remaining = duration - progress;
      if (!isPlaying) return;

      const transitionWindowMs = Math.max(
        1500,
        Math.round(this.fadeDurationSeconds * 1000) + 800
      );

      if (remaining < transitionWindowMs) {
        console.log("[PartyManager] Song endet bald → bereite nächsten vor");

        if (!this.transitionInProgress) {
          await this.playNextTrack();
        }
      }
    } catch (err) {
      console.error("[PartyManager] Sync-Fehler:", err);
    }
  }
}
