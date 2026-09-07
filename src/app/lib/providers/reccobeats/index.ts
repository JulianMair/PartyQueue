// src/app/lib/providers/reccobeats/index.ts
//
// Anbieter für Audio-Merkmale auf Basis von ReccoBeats (Story B1).
//
// Hintergrund: Spotify beantwortet den Endpunkt für Audio-Merkmale seit
// November 2024 bei neu angelegten Apps mit 403. ReccoBeats liefert
// vergleichbare Werte und lässt sich über die Spotify-Track-ID abfragen.
//
// Der Abruf ist zweistufig, das gibt die API so vor:
//   1. GET /v1/track?ids=<spotifyId,...>   liefert je Titel eine eigene
//      ReccoBeats-Kennung (die Spotify-ID ist dort nur der Suchschlüssel)
//   2. GET /v1/track/<reccoId>/audio-features   liefert die Merkmale
//
// Zwei Eigenheiten, die den Aufbau bestimmen:
//   - Schritt 1 verträgt mehrere IDs auf einmal, Schritt 2 nicht.
//   - Die Antwort aus Schritt 1 kommt nicht in der angefragten Reihenfolge
//     zurück. Die Zuordnung läuft deshalb über das Feld "href", in dem die
//     Spotify-ID steht, und niemals über die Position in der Liste.

import type { AudioFeatureProvider, AudioFeatures } from "../types";
import { AudioFeatureCache } from "./cache";

const DEFAULT_BASE_URL = "https://api.reccobeats.com/v1";
const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Wie viele Spotify-IDs pro Nachschlage-Anfrage mitgegeben werden.
 * Bewusst zurückhaltend gewählt, weil die API keine Obergrenze nennt.
 */
const LOOKUP_BATCH_SIZE = 40;

function getBaseUrl(): string {
  return process.env.RECCOBEATS_BASE_URL || DEFAULT_BASE_URL;
}

function getTimeoutMs(): number {
  const configured = Number(process.env.RECCOBEATS_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TIMEOUT_MS;
}

/**
 * Holt eine Adresse und gibt die Antwort als JSON zurück.
 *
 * Gibt in jedem Fehlerfall null zurück statt zu werfen: ein nicht
 * erreichbarer Anbieter darf die Party nicht zum Stehen bringen. Der
 * Zeitwächter verhindert, dass eine hängende Anfrage alles blockiert.
 */
async function fetchJson(url: string, timeoutMs: number): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      console.warn(`[reccobeats] ${url} antwortete mit ${response.status}`);
      return null;
    }
    return await response.json();
  } catch (error) {
    console.warn(`[reccobeats] Anfrage fehlgeschlagen: ${url}`, error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Zieht die Spotify-Track-ID aus der von ReccoBeats gelieferten Adresse.
 * Beispiel: "https://open.spotify.com/track/2SSFvQ..." ergibt "2SSFvQ...".
 *
 * Diese Zuordnung ist nötig, weil die Trefferliste in beliebiger
 * Reihenfolge zurückkommt.
 */
function extractSpotifyId(href: unknown): string | null {
  if (typeof href !== "string") return null;
  const match = href.match(/\/track\/([A-Za-z0-9]+)/);
  return match ? match[1] : null;
}

/** Liest eine Zahl aus unsicheren Daten, sonst null. */
function readNumber(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Wandelt die Antwort des Merkmals-Endpunkts in unseren Datentyp um.
 *
 * Nur wenn alle vier benötigten Werte vorhanden sind, entsteht ein
 * Ergebnis. Ein halber Satz Merkmale wäre für die spätere Berechnung
 * schlechter als gar keiner, weil fehlende Werte stillschweigend als
 * Null durchschlagen würden.
 */
function parseAudioFeatures(raw: unknown): AudioFeatures | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;

  const tempo = readNumber(source, "tempo");
  const energy = readNumber(source, "energy");
  const danceability = readNumber(source, "danceability");
  const valence = readNumber(source, "valence");

  if (tempo === null || energy === null || danceability === null || valence === null) {
    return null;
  }
  return { tempo, energy, danceability, valence };
}

export class ReccoBeatsProvider implements AudioFeatureProvider {
  readonly name = "reccobeats";

  /**
   * Der Zwischenspeicher gehört zur Instanz. Damit alle Aufrufer davon
   * profitieren, wird der Anbieter in der Factory einmalig erzeugt.
   */
  private readonly cache = new AudioFeatureCache();

  /**
   * Liefert die Merkmale zu den angefragten Spotify-Track-IDs.
   *
   * Ablauf: zuerst wird der Zwischenspeicher befragt, nur die restlichen
   * IDs gehen an ReccoBeats. Das Ergebnis enthält für jede angefragte ID
   * einen Eintrag, nicht auflösbare Titel stehen mit null darin.
   */
  async getAudioFeatures(trackIds: string[]): Promise<Map<string, AudioFeatures | null>> {
    const result = new Map<string, AudioFeatures | null>();
    if (!Array.isArray(trackIds) || trackIds.length === 0) return result;

    // Doppelte Anfragen zusammenfassen und Leeres aussortieren.
    const uniqueIds = Array.from(new Set(trackIds.filter((id) => typeof id === "string" && id.length > 0)));

    const missing: string[] = [];
    for (const id of uniqueIds) {
      const cached = this.cache.get(id);
      if (cached) {
        result.set(id, cached);
      } else {
        missing.push(id);
      }
    }
    if (missing.length === 0) return result;

    // Schritt 1: Spotify-IDs auf ReccoBeats-Kennungen abbilden.
    const idMapping = await this.lookupReccoIds(missing);

    // Schritt 2: Merkmale je Kennung holen. Nacheinander, weil die API
    // dafür keine Sammelabfrage anbietet.
    for (const spotifyId of missing) {
      const reccoId = idMapping.get(spotifyId);
      if (!reccoId) {
        result.set(spotifyId, null);
        continue;
      }
      const features = await this.fetchFeatures(reccoId);
      if (features) this.cache.set(spotifyId, features);
      result.set(spotifyId, features);
    }

    return result;
  }

  /**
   * Schritt 1: fragt für mehrere Spotify-IDs die ReccoBeats-Kennungen ab.
   *
   * Die Zuordnung erfolgt über das Feld "href" jedes Treffers, weil die
   * Reihenfolge der Antwort nicht der Anfrage entspricht.
   */
  private async lookupReccoIds(spotifyIds: string[]): Promise<Map<string, string>> {
    const mapping = new Map<string, string>();
    const baseUrl = getBaseUrl().replace(/\/$/, "");
    const timeoutMs = getTimeoutMs();

    for (let start = 0; start < spotifyIds.length; start += LOOKUP_BATCH_SIZE) {
      const batch = spotifyIds.slice(start, start + LOOKUP_BATCH_SIZE);
      const url = `${baseUrl}/track?ids=${encodeURIComponent(batch.join(","))}`;
      const payload = await fetchJson(url, timeoutMs);
      if (!payload || typeof payload !== "object") continue;

      const content = (payload as Record<string, unknown>).content;
      if (!Array.isArray(content)) continue;

      for (const entry of content) {
        if (!entry || typeof entry !== "object") continue;
        const record = entry as Record<string, unknown>;
        const spotifyId = extractSpotifyId(record.href);
        const reccoId = typeof record.id === "string" ? record.id : null;
        if (spotifyId && reccoId) mapping.set(spotifyId, reccoId);
      }
    }
    return mapping;
  }

  /** Schritt 2: holt die Merkmale zu einer ReccoBeats-Kennung. */
  private async fetchFeatures(reccoId: string): Promise<AudioFeatures | null> {
    const baseUrl = getBaseUrl().replace(/\/$/, "");
    const url = `${baseUrl}/track/${encodeURIComponent(reccoId)}/audio-features`;
    const payload = await fetchJson(url, getTimeoutMs());
    return parseAudioFeatures(payload);
  }
}
