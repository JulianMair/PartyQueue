// src/app/lib/party/PartyManager.ts
import EventEmitter from "events";
import { MusicProvider, Track, PartyTrack } from "../providers/types";
import type { TransitionProfile } from "./settings";

export interface Suggestion {
  track: PartyTrack;
  suggestedBy: string; // clientId
  votes: Set<string>; // clientIds that voted for this suggestion
  createdAt: number;
}

export interface SuggestionJSON {
  track: PartyTrack;
  suggestedBy: string;
  votes: string[];
  createdAt: number;
}

export interface PartyState {
  id: string;
  queue: PartyTrack[];
  currentTrack?: PartyTrack;
  isActive: boolean;
  version: number;
  suggestions?: SuggestionJSON[];
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
  private suggestions: Map<string, Suggestion> = new Map(); // trackId -> Suggestion
  private playedTrackIds: Set<string> = new Set();
  private suggestionThreshold = 3;
  private fadeDurationSeconds = 0;
  private transitionProfile: TransitionProfile = "balanced";
  private transitionInProgress = false;
  private lastVoteAt = 0;
  private pendingTrimHandledTrackId: string | null = null;
  private suppressSyncMismatchUntil = 0;
  private lastAdvanceSourceTrackId: string | null = null;
  private lastAdvanceTriggerAt = 0;
  private autoAdvanceCooldownUntil = 0;
  private lastPlaybackTrackId: string | null = null;
  private lastPlaybackProgressMs = 0;
  private lastPlaybackObservedAt = 0;
  private suppressAutoAdvanceUntil = 0;


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
    // Restore suggestions from persisted state
    if (initialState?.suggestions) {
      for (const s of initialState.suggestions) {
        this.suggestions.set(s.track.id, {
          track: s.track,
          suggestedBy: s.suggestedBy,
          votes: new Set(s.votes),
          createdAt: s.createdAt,
        });
      }
    }
  }

  getState(): PartyState {
    return {
      ...this.state,
      suggestions: this.getSuggestionsJSON(),
    };
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

  setTransitionProfile(profile: TransitionProfile) {
    this.transitionProfile = profile;
  }

  private getTransitionTuning() {
    switch (this.transitionProfile) {
      case "smooth":
        return {
          mismatchGraceMs: 7000,
          fadeMinSteps: 3,
          fadeMaxSteps: 5,
          fadeStepFactor: 2.4,
          transitionBufferMs: 1300,
        };
      case "aggressive":
        return {
          mismatchGraceMs: 3000,
          fadeMinSteps: 2,
          fadeMaxSteps: 3,
          fadeStepFactor: 1.6,
          transitionBufferMs: 500,
        };
      case "balanced":
      default:
        return {
          mismatchGraceMs: 5000,
          fadeMinSteps: 2,
          fadeMaxSteps: 4,
          fadeStepFactor: 2,
          transitionBufferMs: 800,
        };
    }
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

  /**
   * Ermittelt den letzten Song aus der aktuell votbaren Top-10 (Index 9).
   * Nur wenn mehr als 10 Songs vorhanden sind, wird ein Kandidat geliefert.
   */
  private getVotingTailTrimCandidateId() {
    const mobileVotingLimit = 10;
    if (this.state.queue.length <= mobileVotingLimit) return null;
    return this.state.queue[mobileVotingLimit - 1]?.id ?? null;
  }

  /** Entfernt einen Queue-Track ohne eigene Events/Version-Bump. */
  private removeTrackByIdSilently(trackId: string) {
    const index = this.state.queue.findIndex((track) => track.id === trackId);
    if (index < 0) return false;
    const [removed] = this.state.queue.splice(index, 1);
    if (removed) {
      this.voted.forEach((tracks) => tracks.delete(removed.id));
    }
    return Boolean(removed);
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
  async addTrack(track: Track, insertIndex?: number) {
    await this.addTracks([track], insertIndex);
  }

  /** MEHRERE SONGS ZUR PARTYQUEUE HINZUFÜGEN (nur intern!) */
  async addTracks(tracks: Track[], insertIndex?: number) {
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

    if (typeof insertIndex === "number" && Number.isFinite(insertIndex)) {
      const safeIndex = Math.max(
        0,
        Math.min(this.state.queue.length, Math.floor(insertIndex))
      );
      this.state.queue.splice(safeIndex, 0, ...partyTracks);
    } else {
      this.state.queue.push(...partyTracks);
    }
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

  /** HOST: Queue-Eintrag stabil über Track-ID löschen */
  removeTrackById(trackId: string) {
    if (!trackId) return false;
    const index = this.state.queue.findIndex((track) => track.id === trackId);
    if (index < 0) return false;
    this.removeTrackAt(index);
    return true;
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


  /* ── Suggestion System ──────────────────────────────────────────────────── */

  setSuggestionThreshold(threshold: number) {
    this.suggestionThreshold = Math.max(1, Math.min(20, Math.round(threshold)));
  }

  getSuggestionThreshold() {
    return this.suggestionThreshold;
  }

  private getSuggestionsJSON(): SuggestionJSON[] {
    return Array.from(this.suggestions.values()).map((s) => ({
      track: s.track,
      suggestedBy: s.suggestedBy,
      votes: Array.from(s.votes),
      createdAt: s.createdAt,
    }));
  }

  getSuggestions(): SuggestionJSON[] {
    return this.getSuggestionsJSON();
  }

  /** Returns trackId of active suggestion by this client, or null */
  getClientSuggestion(clientId: string): string | null {
    for (const [trackId, s] of this.suggestions) {
      if (s.suggestedBy === clientId) return trackId;
    }
    return null;
  }

  suggest(track: Track, clientId: string): { status: "ok" | "already_suggested" | "duplicate" | "in_queue"; suggestion?: SuggestionJSON } {
    // Already in queue?
    if (this.state.queue.some((t) => t.id === track.id)) {
      return { status: "in_queue" };
    }
    // Currently playing?
    if (this.state.currentTrack?.id === track.id) {
      return { status: "in_queue" };
    }
    // Already suggested by someone?
    if (this.suggestions.has(track.id)) {
      return { status: "duplicate" };
    }
    // Client already has an active suggestion?
    if (this.getClientSuggestion(clientId)) {
      return { status: "already_suggested" };
    }

    const suggestion: Suggestion = {
      track: { ...track, votes: 1, addedAt: Date.now() },
      suggestedBy: clientId,
      votes: new Set([clientId]),
      createdAt: Date.now(),
    };
    this.suggestions.set(track.id, suggestion);

    this.bumpVersion();
    this.emit("stateChanged", this.state);

    const json: SuggestionJSON = {
      track: suggestion.track,
      suggestedBy: suggestion.suggestedBy,
      votes: Array.from(suggestion.votes),
      createdAt: suggestion.createdAt,
    };
    return { status: "ok", suggestion: json };
  }

  voteSuggestion(trackId: string, clientId: string): { status: "ok" | "already_voted" | "not_found" | "promoted"; promoted?: boolean } {
    const suggestion = this.suggestions.get(trackId);
    if (!suggestion) return { status: "not_found" };

    if (suggestion.votes.has(clientId)) {
      return { status: "already_voted" };
    }

    suggestion.votes.add(clientId);
    suggestion.track.votes = suggestion.votes.size;

    // Check if threshold reached → promote to queue
    if (suggestion.votes.size >= this.suggestionThreshold) {
      this.suggestions.delete(trackId);
      const partyTrack: PartyTrack = {
        ...suggestion.track,
        votes: suggestion.votes.size,
        addedAt: Date.now(),
      };
      this.state.queue.push(partyTrack);
      this.sortQueue();

      // Transfer votes to the voted map so they count as real votes
      for (const voter of suggestion.votes) {
        if (!this.voted.has(voter)) this.voted.set(voter, new Set());
        this.voted.get(voter)!.add(trackId);
      }

      this.bumpVersion();
      this.emit("queueUpdated", this.state.queue);
      this.emit("stateChanged", this.state);
      return { status: "promoted", promoted: true };
    }

    this.bumpVersion();
    this.emit("stateChanged", this.state);
    return { status: "ok" };
  }

  unvoteSuggestion(trackId: string, clientId: string): { status: "ok" | "not_found" | "not_voted" | "removed" } {
    const suggestion = this.suggestions.get(trackId);
    if (!suggestion) return { status: "not_found" };

    if (!suggestion.votes.has(clientId)) {
      return { status: "not_voted" };
    }

    suggestion.votes.delete(clientId);
    suggestion.track.votes = suggestion.votes.size;

    // If suggester unvotes their own suggestion and nobody else voted, remove it
    if (suggestion.suggestedBy === clientId && suggestion.votes.size === 0) {
      this.suggestions.delete(trackId);
      this.bumpVersion();
      this.emit("stateChanged", this.state);
      return { status: "removed" };
    }

    this.bumpVersion();
    this.emit("stateChanged", this.state);
    return { status: "ok" };
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
    // Egal ob manuell oder automatisch ausgelöst: verhindere direkte Doppel-Advances.
    this.autoAdvanceCooldownUntil = Date.now() + 4000;
    this.lastAdvanceSourceTrackId = this.state.currentTrack?.id ?? null;

    // WICHTIG: Track SOFORT aus der Queue nehmen, BEVOR der Fade startet.
    // So kann Vote-Reordering waehrend des Fades den naechsten Track nicht mehr aendern.
    const next = this.state.queue[0];
    if (!next) {
      this.transitionInProgress = false;
      return;
    }
    const votingTailCandidateId = this.getVotingTailTrimCandidateId();
    this.state.queue.shift();
    this.pendingTrimHandledTrackId = next.id;

    const commitTransition = () => {
      this.state.currentTrack = next;
      this.playedTrackIds.add(next.id);
      this.voted.forEach((tracks) => tracks.delete(next.id));
      if (votingTailCandidateId && votingTailCandidateId !== next.id) {
        this.removeTrackByIdSilently(votingTailCandidateId);
      }
      this.bumpVersion();
      this.emit("trackStarted", next);
      this.emit("queueUpdated", this.state.queue);
      this.emit("stateChanged", this.state);
      this.lastAdvanceTriggerAt = Date.now();
      console.log(`[PartyManager] Spiele nächsten Track: ${next.name}`);
    };

    const rollbackQueue = () => {
      // Bei Fehler: Track wieder vorne einfuegen
      this.state.queue.unshift(next);
      this.pendingTrimHandledTrackId = null;
      // Cooldown zurücksetzen damit Retry sofort möglich ist
      this.autoAdvanceCooldownUntil = 0;
      this.suppressSyncMismatchUntil = 0;
      this.bumpVersion();
      this.emit("queueUpdated", this.state.queue);
      this.emit("stateChanged", this.state);
    };

    const playNextInternal = async () => {
      try {
        const tuning = this.getTransitionTuning();
        this.suppressSyncMismatchUntil = Date.now() + tuning.mismatchGraceMs + 2000;
        await this.provider.play(next.uri);
        this.suppressSyncMismatchUntil = Date.now() + tuning.mismatchGraceMs;
      } catch (err) {
        console.error("[PartyManager] Konnte nächsten Track nicht starten:", err);
        rollbackQueue();
        return false;
      }

      commitTransition();
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

      if (currentVolume === null || currentVolume <= 0) {
        await playNextInternal();
        return;
      }

      const tuning = this.getTransitionTuning();

      // --- Phase 1: Gradueller Fade-Down ---
      // Nutze die Tuning-Parameter fuer mehrstufigen Fade
      const fadeOutMs = Math.round(totalFadeMs * 0.6);
      const steps = Math.max(
        tuning.fadeMinSteps,
        Math.min(tuning.fadeMaxSteps, Math.round(fadeOutMs / 400))
      );
      const stepDelayMs = Math.round(fadeOutMs / steps);

      for (let i = 1; i <= steps; i++) {
        // Exponentielle Kurve: schnell am Anfang, sanft am Ende
        const progress = i / steps;
        const curve = Math.pow(progress, tuning.fadeStepFactor);
        const targetVolume = Math.max(0, Math.round(currentVolume * (1 - curve)));
        const ok = await safeSetVolume(targetVolume);
        if (!ok) break;
        if (i < steps) await wait(stepDelayMs);
      }

      // --- Phase 2: Naechsten Track starten ---
      const didStartNext = await playNextInternal();
      if (!didStartNext) {
        await safeSetVolume(currentVolume);
        return;
      }

      // --- Phase 3: Gradueller Fade-Up ---
      const fadeInMs = Math.round(totalFadeMs * 0.4);
      const fadeInSteps = Math.max(2, Math.min(tuning.fadeMaxSteps, Math.round(fadeInMs / 300)));
      const fadeInStepDelay = Math.round(fadeInMs / fadeInSteps);

      for (let i = 1; i <= fadeInSteps; i++) {
        const progress = i / fadeInSteps;
        // Sanfte Kurve: langsam am Anfang, schneller am Ende
        const curve = Math.pow(progress, 1 / tuning.fadeStepFactor);
        const targetVolume = Math.min(currentVolume, Math.round(currentVolume * curve));
        await safeSetVolume(targetVolume);
        if (i < fadeInSteps) await wait(fadeInStepDelay);
      }

      // Sicherheitshalber exakten Original-Wert setzen
      await safeSetVolume(currentVolume);
    } finally {
      this.transitionInProgress = false;
    }
  }

  /**
   * Uebernimmt einen bestimmten Track aus der Queue als aktuell laufenden Song.
   * Sucht per URI statt blind queue[0] zu nehmen, da Votes die Reihenfolge
   * zwischen Spotify-Wechsel und diesem Aufruf geaendert haben koennten.
   */
  private promoteQueueTrackAsCurrent(spotifyUri: string) {
    const index = this.state.queue.findIndex((t) => t.uri === spotifyUri);
    if (index < 0) return false;

    const [next] = this.state.queue.splice(index, 1);
    if (!next) return false;

    const votingTailCandidateId = this.getVotingTailTrimCandidateId();
    this.state.currentTrack = next;
    this.playedTrackIds.add(next.id);
    this.voted.forEach((tracks) => tracks.delete(next.id));
    if (votingTailCandidateId && votingTailCandidateId !== next.id) {
      this.removeTrackByIdSilently(votingTailCandidateId);
    }
    this.pendingTrimHandledTrackId = next.id;

    this.bumpVersion();
    this.emit("trackStarted", next);
    this.emit("queueUpdated", this.state.queue);
    this.emit("stateChanged", this.state);
    return true;
  }

  /** HAUPT-SYNC LOGIK */
  private async syncWithSpotify() {
    try {
      const playback = await this.provider.getCurrentPlayback();
      if (!playback) return;

      const spotifyItem = playback.item ?? null;
      const isPlaying = playback.is_playing ?? false;

      // FALL 1: Kein Track mehr in Spotify (Song zu Ende, nicht nur pausiert)
      // Wichtig: !isPlaying allein reicht NICHT – das bedeutet nur "pausiert".
      // Nur wenn Spotify keinen Track mehr hat, starten wir den naechsten.
      if (!spotifyItem && this.state.queue.length > 0) {
        const now = Date.now();
        if (now > this.autoAdvanceCooldownUntil && !this.transitionInProgress) {
          console.log("[PartyManager] Kein Track in Spotify, Queue nicht leer → starte nächsten");
          await this.playNextTrack();
        }
        return;
      }

      if (!spotifyItem) return;

      const spotifyUri = spotifyItem.uri;
      const currentUri = this.state.currentTrack?.uri;
      const now = Date.now();

      // FALL 2: Spotify hat auf einen neuen Song gewechselt
      if (spotifyUri !== currentUri) {
        console.log(`[PartyManager] Trackwechsel erkannt: ${spotifyItem.name}`);
        // Waehrend eines Transitions (Fade laeuft) ignorieren wir externe Wechsel komplett
        if (this.transitionInProgress || Date.now() < this.suppressSyncMismatchUntil) {
          return;
        }
        this.lastAdvanceSourceTrackId = null;
        // Dedupe: Wechsel wurde bereits durch `playNextTrack` verarbeitet.
        if (spotifyItem.id && spotifyItem.id === this.pendingTrimHandledTrackId) {
          this.pendingTrimHandledTrackId = null;
        } else {
          // Suche den Track in der Queue per URI (nicht blind queue[0])
          const matchInQueue = this.state.queue.some((t) => t.uri === spotifyUri);

          if (matchInQueue) {
            // Spotify spielt einen Track aus unserer Queue → per URI promoten
            this.promoteQueueTrackAsCurrent(spotifyUri);
          } else if (this.state.queue.length > 0) {
            // Spotify spielt einen Track der NICHT in unserer Queue ist.
            // Statt ewig zu warten: als externen Track akzeptieren und Queue intakt lassen.
            console.warn(
              "[PartyManager] Externer Spotify-Track erkannt, aktualisiere currentTrack"
            );
            const externalTrack: PartyTrack = {
              id: spotifyItem.id,
              uri: spotifyItem.uri,
              name: spotifyItem.name,
              artist: spotifyItem.artists.map((a: any) => a.name).join(", "),
              previewUrl: spotifyItem.preview_url ?? null,
              albumArt: spotifyItem.album?.images?.[0]?.url,
              durationMs: spotifyItem.duration_ms,
              votes: 0,
              addedAt: Date.now(),
            };
            this.state.currentTrack = externalTrack;
            if (externalTrack.id) this.playedTrackIds.add(externalTrack.id);
            this.bumpVersion();
            this.emit("trackStarted", externalTrack);
            this.emit("stateChanged", this.state);
          } else {
            // Nur wenn Queue leer ist, spiegeln wir den externen Track als Info.
            const newTrack: PartyTrack = {
              id: spotifyItem.id,
              uri: spotifyItem.uri,
              name: spotifyItem.name,
              artist: spotifyItem.artists.map((a: any) => a.name).join(", "),
              previewUrl: spotifyItem.preview_url ?? null,
              albumArt: spotifyItem.album?.images?.[0]?.url,
              durationMs: spotifyItem.duration_ms,
              votes: 0,
              addedAt: Date.now(),
            };

            this.state.currentTrack = newTrack;
            if (newTrack.id) {
              this.playedTrackIds.add(newTrack.id);
            }

            this.bumpVersion();
            this.emit("trackStarted", newTrack);
            this.emit("queueUpdated", this.state.queue);
            this.emit("stateChanged", this.state);
          }
        }
      }

      // Echtzeit-Fortschritt auf currentTrack aktualisieren (fuer Display-Endpunkt)
      const progress = playback.progress_ms ?? 0;
      const duration = spotifyItem.duration_ms ?? 0;
      if (this.state.currentTrack) {
        this.state.currentTrack.progressMs = progress;
        this.state.currentTrack.isplaying = isPlaying;
        this.state.currentTrack.durationMs = duration;
      }

      const remaining = duration - progress;

      // FALL 1c: Spotify hat denselben Song nochmal gestartet (Autoplay/Repeat).
      // Erkennung: gleiche URI, aber Progress springt von >80% auf <10% des Songs.
      const observedTrackId = spotifyItem.id ?? spotifyUri;
      if (
        spotifyUri === currentUri &&
        this.lastPlaybackTrackId === observedTrackId &&
        this.lastPlaybackObservedAt > 0 &&
        duration > 0 &&
        this.state.queue.length > 0
      ) {
        const wasNearEnd = this.lastPlaybackProgressMs > duration * 0.8;
        const nowNearStart = progress < duration * 0.1;
        if (wasNearEnd && nowNearStart && !this.transitionInProgress) {
          console.log("[PartyManager] Song-Restart erkannt (Autoplay/Repeat) → starte nächsten aus Queue");
          this.autoAdvanceCooldownUntil = 0;
          await this.playNextTrack();
          return;
        }
      }

      // FALL 1b: Song ist natürlich zu Ende (pausiert am Ende, Item noch vorhanden)
      // Spotify setzt is_playing=false und behält den Track — FALL 1 greift hier nicht.
      if (!isPlaying && duration > 0 && remaining < 3000 && this.state.queue.length > 0) {
        if (now > this.autoAdvanceCooldownUntil && !this.transitionInProgress) {
          console.log("[PartyManager] Song zu Ende (pausiert am Ende) → starte nächsten");
          await this.playNextTrack();
        }
        return;
      }

      // FALL 3: Ist der Song bald vorbei?
      if (!isPlaying) return;

      // Seek-/Sprung-Erkennung: Manuelles Vorspulen → kurz Auto-Advance unterdrücken.
      // Aber NUR wenn der Sprung vorwärts oder innerhalb des Songs ist (kein Restart).
      if (
        this.lastPlaybackTrackId === observedTrackId &&
        this.lastPlaybackObservedAt > 0
      ) {
        const deltaProgress = Math.abs(progress - this.lastPlaybackProgressMs);
        const deltaTimeMs = now - this.lastPlaybackObservedAt;
        const isForwardSeek = progress > this.lastPlaybackProgressMs;
        const isLikelySeekJump = deltaProgress > 6000 && deltaTimeMs < 3000 && isForwardSeek;
        if (isLikelySeekJump) {
          this.suppressAutoAdvanceUntil = now + 3000;
        }
      }
      this.lastPlaybackTrackId = observedTrackId;
      this.lastPlaybackProgressMs = progress;
      this.lastPlaybackObservedAt = now;

      // Transition-Window = volle Fade-Dauer + Buffer + Netzwerk-Overhead
      // Der Fade nutzt 60% fuer Fade-Out + play() + 40% fuer Fade-In
      // Wir muessen frueh genug starten damit der Fade-Out vor Song-Ende abgeschlossen ist
      const fadeMs = Math.round(this.fadeDurationSeconds * 1000);
      const transitionWindowMs = Math.max(
        2000,
        Math.round(fadeMs * 0.6) + this.getTransitionTuning().transitionBufferMs + 1500
      );

      if (remaining < transitionWindowMs) {
        console.log("[PartyManager] Song endet bald → bereite nächsten vor");

        if (now < this.autoAdvanceCooldownUntil) return;
        if (now < this.suppressAutoAdvanceUntil) return;
        const isDuplicateTrackTrigger =
          Boolean(spotifyItem.id) && spotifyItem.id === this.lastAdvanceSourceTrackId;
        const isTooSoon = now - this.lastAdvanceTriggerAt < 1200;

        if (!this.transitionInProgress && !isDuplicateTrackTrigger && !isTooSoon) {
          this.lastAdvanceSourceTrackId = spotifyItem.id ?? null;
          this.lastAdvanceTriggerAt = now;
          await this.playNextTrack();
        }
      }
    } catch (err) {
      console.error("[PartyManager] Sync-Fehler:", err);
    }
  }
}
