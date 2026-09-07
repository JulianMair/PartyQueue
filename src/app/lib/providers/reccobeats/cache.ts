// src/app/lib/providers/reccobeats/cache.ts
//
// Zwischenspeicher für bereits geholte Audio-Merkmale (Story B1).
//
// Warum überhaupt: Das Abrufen ist teuer. Für jeden Titel sind zwei
// Anfragen nötig — erst die Spotify-ID nachschlagen, dann die Merkmale
// holen. Ohne Zwischenspeicher würde derselbe Titel bei jeder Berechnung
// erneut abgefragt.
//
// Warum im Arbeitsspeicher und nicht in der Datenbank: Die Merkmale eines
// Titels ändern sich nie, ein Neustart kostet also nur erneutes Laden und
// nichts an Richtigkeit. Diese Klasse ist die einzige Stelle, die den
// Speicherort kennt — ein späterer Wechsel auf die Datenbank betrifft
// nur diese Datei.

import type { AudioFeatures } from "../types";

export class AudioFeatureCache {
  /** Schlüssel ist die Spotify-Track-ID. */
  private readonly entries = new Map<string, AudioFeatures>();

  /** Ist zu dieser Track-ID etwas hinterlegt? */
  has(trackId: string): boolean {
    return this.entries.has(trackId);
  }

  /** Hinterlegte Merkmale oder undefined, wenn nichts gespeichert ist. */
  get(trackId: string): AudioFeatures | undefined {
    return this.entries.get(trackId);
  }

  /**
   * Legt Merkmale ab.
   *
   * Absichtlich werden nur Erfolge gespeichert. Würden wir uns auch merken,
   * dass zu einem Titel nichts gefunden wurde, bliebe ein einmaliger Ausfall
   * des Anbieters für den Rest der Laufzeit hängen. So wird ein fehlender
   * Titel beim nächsten Mal erneut versucht.
   */
  set(trackId: string, features: AudioFeatures): void {
    this.entries.set(trackId, features);
  }

  /** Anzahl gespeicherter Einträge — für Protokollausgaben und Prüfungen. */
  get size(): number {
    return this.entries.size;
  }

  /** Leert den Speicher. Wird für Prüfungen gebraucht. */
  clear(): void {
    this.entries.clear();
  }
}
