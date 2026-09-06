// src/app/lib/party/playedHistory.ts
//
// Historie der Titel, die in einer Party tatsächlich gelaufen sind (Story A1).
//
// Bisher merkte sich der PartyManager nur die IDs bereits gespielter Titel,
// um Wiederholungen zu vermeiden — ohne Zeitpunkt und ohne Reihenfolge.
// Für spätere Auswertungen reicht das nicht, deshalb hier eine geordnete
// Liste mit Zeitstempel.
//
// Alle Funktionen sind rein: gleiche Eingabe, gleiche Ausgabe, keine
// Seiteneffekte, kein Zugriff auf Datenbank oder Netzwerk. Dadurch lassen
// sie sich später ohne laufende Party testen.

/** Ein einzelner gespielter Titel. Bewusst schlank gehalten. */
export interface PlayedTrackEntry {
  /** Spotify-Track-ID — identifiziert den Titel eindeutig. */
  trackId: string;
  name: string;
  artist: string;
  /** Zeitpunkt des Abspielstarts als Millisekunden seit 1970 (Date.now()). */
  playedAt: number;
}

/**
 * Obergrenze für die Anzahl gespeicherter Einträge.
 *
 * Die Historie wird als Teil des Party-Dokuments in MongoDB abgelegt. Ohne
 * Grenze würde dieses Dokument über einen langen Abend unbegrenzt wachsen.
 * 200 Titel entsprechen grob 10 Stunden Musik und damit deutlich mehr als
 * eine Party dauert.
 */
export const PLAYED_HISTORY_MAX = 200;

/**
 * Zeitfenster, innerhalb dessen derselbe Titel als Doppelmeldung gilt.
 *
 * Spotify meldet beim Wechsel gelegentlich denselben Titel zweimal kurz
 * hintereinander. Ein echtes erneutes Abspielen dauert immer mindestens so
 * lange wie der Titel selbst, liegt also weit über diesen 10 Sekunden.
 */
const DUPLICATE_WINDOW_MS = 10_000;

/**
 * Baut aus einem Titel den Historien-Eintrag.
 *
 * Der Zeitpunkt wird als Parameter übergeben (statt intern Date.now() zu
 * rufen), damit die Funktion in Tests mit einem festen Wert aufgerufen
 * werden kann und dann ein vorhersagbares Ergebnis liefert.
 */
export function makePlayedEntry(
  track: { id: string; name: string; artist: string },
  playedAt: number = Date.now()
): PlayedTrackEntry {
  return {
    trackId: track.id,
    name: track.name,
    artist: track.artist,
    playedAt,
  };
}

/**
 * Hängt einen Eintrag hinten an die Historie an und gibt eine neue Liste
 * zurück (die übergebene bleibt unverändert).
 *
 * Zwei Dinge passieren dabei:
 *  - Doppelmeldungen desselben Titels innerhalb weniger Sekunden werden
 *    verworfen, damit die Historie den Ablauf korrekt wiedergibt.
 *  - Ist die Liste zu lang, fallen die ältesten Einträge vorne weg.
 */
export function appendPlayedEntry(
  history: PlayedTrackEntry[],
  entry: PlayedTrackEntry
): PlayedTrackEntry[] {
  const last = history[history.length - 1];
  const isDuplicate =
    last !== undefined &&
    last.trackId === entry.trackId &&
    entry.playedAt - last.playedAt < DUPLICATE_WINDOW_MS;
  if (isDuplicate) return history;

  const next = [...history, entry];
  if (next.length <= PLAYED_HISTORY_MAX) return next;
  // Nur das Ende behalten: die neuesten Einträge sind die relevanten.
  return next.slice(next.length - PLAYED_HISTORY_MAX);
}

/**
 * Liest die Historie aus gespeicherten Daten zurück.
 *
 * Der Wert kommt aus der Datenbank und ist damit nichts, worauf wir uns
 * blind verlassen sollten: Party-Dokumente aus der Zeit vor dieser Story
 * haben das Feld gar nicht, und einzelne Einträge könnten unvollständig
 * sein. Deshalb wird jeder Eintrag geprüft und Unbrauchbares still
 * übersprungen, statt einen Fehler zu werfen — eine unvollständige
 * Historie ist besser als eine Party, die nicht mehr lädt.
 */
export function sanitizePlayedHistory(input: unknown): PlayedTrackEntry[] {
  if (!Array.isArray(input)) return [];

  const result: PlayedTrackEntry[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const candidate = raw as Record<string, unknown>;

    const trackId = typeof candidate.trackId === "string" ? candidate.trackId : null;
    const name = typeof candidate.name === "string" ? candidate.name : null;
    const artist = typeof candidate.artist === "string" ? candidate.artist : null;
    const playedAt =
      typeof candidate.playedAt === "number" && Number.isFinite(candidate.playedAt)
        ? candidate.playedAt
        : null;

    if (trackId === null || name === null || artist === null || playedAt === null) {
      continue;
    }
    result.push({ trackId, name, artist, playedAt });
  }

  // Auch beim Laden die Obergrenze einhalten, falls ein altes Dokument
  // mehr Einträge enthält als heute erlaubt sind.
  return result.slice(-PLAYED_HISTORY_MAX);
}
