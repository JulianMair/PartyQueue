# Trend-Recommender — Architektur und Verfahren (Story G1)

> Beschreibt, was tatsächlich gebaut wurde. Der ursprüngliche Arbeitsauftrag steht in
> `docs/feature-trend-recommender.md`, der Verlauf der Umsetzung im Arbeitstagebuch
> von `docs/agile/board.md`. Dieses Dokument ist der Soll-Ist-Abgleich für später.

## 1. Überblick

Das Feature erkennt aus den bereits gespielten Titeln einer Party den musikalischen
Charakter und die aktuelle Richtungsänderung ("wird schneller", "bleibt stabil", ...)
und füllt die Warteschlange automatisch mit passenden neuen Titeln auf — entweder
direkt oder erst nach Bestätigung durch den Gastgeber.

Es ist **kein trainiertes Modell**. Alles wird zur Laufzeit aus der aktuellen
Party-Session berechnet, nichts wird über Partys hinweg gespeichert oder gelernt —
das ist durch Spotifys Nutzungsbedingungen auch ausdrücklich untersagt.

## 2. Datenfluss

```
gespielter Titel
      │
      ▼
playedHistory.ts (A1/A2)          Chronologische Historie, max. 200 Einträge
      │
      ├──────────────────────────────┐
      ▼                              ▼
partyProfile.ts (C1)          partyTrend.ts (C2)
Zeitgewichtetes Profil        "gerade eben" vs. Gesamtdurchschnitt
(tempo/energy/danceability/   → Label: wird schneller/langsamer/
 valence, exp. Zerfall)         energischer/ruhiger/fröhlicher/
      │                         melancholischer/bleibt stabil
      │                              │
      │                              ▼
      │                        display/page.tsx (E1)
      │                        Chip neben "Aktueller Song"
      ▼
candidatePool.ts (D1)          Kandidaten: Top-Tracks der "angesagten"
                                Künstler aus den zuletzt gespielten Titeln
      │
      ▼
candidateRanking.ts (D2)       Kosinus-Ähnlichkeit zum Profil-Vektor,
                                deterministisch sortiert, mit Erklärung
      │
      ▼
PartyRegistry.buildAutoFillCandidates (D3)
      │
      ├─ autoFillMode "auto"    → direkt in die Queue (PartyManager.addTracks)
      └─ autoFillMode "suggest" → PartyManager.pendingRecommendations (D4),
                                   Gastgeber bestätigt/verwirft einzeln
```

Jede Pfeilspitze ist ein eigener, isoliert entwickelter Schritt (eigene Story,
eigener Commit) — bewusst so geschnitten, dass ein Schritt ausfallen oder fehlen
kann, ohne die anderen zu zerstören (z. B. kein Profil bei junger Party → D1 liefert
trotzdem einen Pool, D2 liefert dann nichts, D3 nimmt den Pool ungerankt).

## 3. Dateien und ihr Zweck

| Datei | Zweck |
|---|---|
| `src/app/lib/party/playedHistory.ts` | Reine Historie-Funktionen (A1/A2): `makePlayedEntry`, `appendPlayedEntry` (Duplikat-Fenster 10s, Obergrenze `PLAYED_HISTORY_MAX = 200`), `takeRecentPlayed`, `sanitizePlayedHistory`. |
| `src/app/lib/party/partyProfile.ts` | `computePartyProfile` (C1): gewichteter Mittelwert, exponentieller Zerfall, Halbwertszeit `RECENCY_HALF_LIFE_MS = 15 Min`, ab `MIN_TRACKS_FOR_PARTY_PROFILE = 5` Titeln. Exportiert auch `normalizeTempo` zur Wiederverwendung. |
| `src/app/lib/party/partyTrend.ts` | `computePartyTrend` (C2): letzte `RECENT_TREND_WINDOW = 6` Titel vs. Gesamtdurchschnitt, ab `MIN_TRACKS_FOR_TREND = 10` Titeln, Label ab Abweichung `> 0.08`. |
| `src/app/lib/party/candidatePool.ts` | `buildCandidatePool` (D1, I/O) + reine Helfer `pickTrendingArtistIds`, `mergeCandidatePools`. Fenster `RECENT_ARTIST_WINDOW = 15`, `TOP_TRENDING_ARTISTS = 5`. Schließt gespielte Titel, aktuelle Queue und laufenden Song aus. |
| `src/app/lib/party/candidateRanking.ts` | `rankCandidatePool` (D2, I/O) + reine Helfer `cosineSimilarity`, `rankCandidates`. Deterministisch (Tie-Break über Track-ID), liefert je Kandidat eine kurze Erklärung. |
| `src/app/lib/party/autoFillSelection.ts` | `selectAutoFillTracks` (D3/D4, reine Funktion): Explicit-Filter, Ausschluss zuletzt vorgeschlagener Titel, Begrenzung auf die gewünschte Anzahl. |
| `src/app/lib/party/PartyManager.ts` | Hält `partyProfile`, `partyTrend` (nicht persistiert, aus `playedTracks` neu berechnet) und `pendingRecommendations` (persistiert). `recomputePartyProfile()` läuft im Hintergrund nach jedem gestarteten Titel. |
| `src/app/lib/party/PartyRegistry.ts` | `buildAutoFillCandidates`, `countTowardsTarget`, `applySelectedTracks` verbinden D1–D4 mit der bestehenden Auto-Fill-Schleife (`seedQueueFromSettings`, `runAutoFillCycle`, alle 20s). |
| `src/app/lib/party/settings.ts` | `PartySettings.autoFillMode` ("auto" \| "suggest"), `targetQueueSize`. Genre-Auswahl wurde nach Story D3 wieder entfernt (siehe Abschnitt 5). |
| `src/app/lib/providers/spotify/artistTopTracks.ts` | Neue Provider-Methode `getArtistTopTracks` (`GET /v1/artists/{id}/top-tracks`). |
| `src/app/lib/providers/spotify/audioFeatures.ts` | `SpotifyFallbackFeatureProvider` (B2) + `fetchArtistIdsPerTrack` (von B2 und D1 gemeinsam genutzt). |
| `src/app/lib/providers/reccobeats/` | `ReccoBeatsProvider` (B1, primäre Merkmalsquelle, mit Zwischenspeicher). |
| `src/app/lib/providers/factory.ts` | `getAudioFeatureProvider()` — Kette ReccoBeats → Spotify-Fallback (B2). |
| `src/app/api/party/display/route.ts` | Liefert `trend: {label} \| null` für die Anzeige. |
| `src/app/api/party/state/route.ts`, `.../recommendations/route.ts` | Liefern/bearbeiten `pendingRecommendations` (D4). |

## 4. Wichtige Design-Entscheidungen

- **Reine Funktion + I/O am Rand, durchgehend.** Jede Rechenlogik (Profil, Trend,
  Ranking, Auswahl) ist eine reine, in `*.test.ts` abgesicherte Funktion. Netzwerk/
  Datenbank passiert ausschließlich in `PartyManager`/`PartyRegistry`. Das hat sich
  aus B1/B2 fortgesetzt und wurde für den Rest des Features beibehalten.
- **Verbotene Spotify-Endpunkte.** Recommendations, Audio Features, Audio Analysis,
  Related Artists und Featured Playlists liefern seit November 2024 für neue Apps
  403. Deshalb: Audio-Merkmale über ReccoBeats + Genre-Schätzung (B1/B2) statt
  Spotifys Audio-Features-Endpunkt; "angesagte Künstler" über Wiedergabe-Historie
  statt Related Artists; Kandidaten über Artist-Top-Tracks + Suche statt
  Recommendations.
- **Kein Profil, kein Problem.** Ist eine Party zu jung für ein Profil (< 5 Titel),
  liefert D1 trotzdem einen Kandidatenpool (rein künstlerbasiert), D3 nimmt ihn
  dann ungerankt. So bleibt Auto-Fill von Anfang an funktionsfähig, statt auf 5
  Titel Vorlaufzeit zu warten.
- **Genau ein Auffüll-Mechanismus.** Story D3 hat die frühere genre-basierte
  Auto-Fill-Suche vollständig ersetzt statt eine zweite, parallel laufende
  Queue-Logik einzuführen (Schutzregel aus `CLAUDE.md`).
- **Genre-Auswahl entfernt (nach D3/D4).** War ursprünglich eine von zwei
  Kandidatenquellen in D1. Nach einem Betriebstest, der zeigte, dass der
  künstlerbasierte Pfad allein bereits sinnvolle, stilistisch passende Titel
  liefert, hat der Product Owner entschieden, die Genre-UI und das zugehörige
  Setting ersatzlos zu entfernen (nicht Teil einer eigenen Story, direkt während
  der D3-Prüfung entschieden).
- **`autoFillMode`/`targetQueueSize` sind Story E2.** Beide Einstellungen
  existierten technisch schon (D3/D4), E2 wurde deshalb ohne neuen Code als
  erfüllt markiert.

## 5. Bekannte Grenzen

- **Orchestratoren sind nicht automatisiert getestet** (Story F1 bewusst außen
  vor): `buildCandidatePool`, `rankCandidatePool`, die Spotify-Provider,
  `PartyManager`/`PartyRegistry` als Ganzes. Sie brauchen eine echte Spotify-
  API-Anbindung bzw. einen laufenden Next.js-Kontext. Verifiziert wurden sie durch
  gezielte Prüfungen gegen die echte API (B1/B2/D1) und Betriebstests im
  laufenden Dev-Server (D3/D4/F2).
- **F2 (Nutzerevaluation)** wurde als simulierter Mehr-Nutzer-Durchlauf über die
  echten APIs durchgeführt (mehrere Client-IDs, gleichzeitiges Voting,
  Bestätigen/Verwerfen), nicht mit echten menschlichen Testpersonen — das kann
  nur der Betreiber selbst nachholen.
- **Keine simulierte echte Wiedergabe.** `playedTracks` entsteht nur durch echte
  Spotify-Play-Events; ohne verbundenes Gerät lässt sich das nicht künstlich
  erzeugen, auch nicht für Tests.
- **Separat gefundene, nicht behobene Probleme** (außerhalb des Feature-Scopes,
  auf Wunsch des Product Owners nicht angefasst): `mongodb.ts` cached eine einmal
  fehlgeschlagene Verbindungs-Promise dauerhaft (Workaround: Server neu starten).
  Das bekannte FooterPlayer/Device-Problem aus `CLAUDE.md` besteht unverändert
  fort.
- **Ein vorbestehender Bug wurde behoben** (nicht durch dieses Feature verursacht,
  aber während dessen Tests entdeckt): Race Condition zwischen optimistischem
  Vote-Update und Hintergrund-Polling in `party/[id]/vote/page.tsx` — siehe
  Commit `e97537a`.

## 6. Selbst nachprüfen

- `npm test` — 61 Tests über die reinen Funktionen aus Abschnitt 3 (Story F1).
- `npm run test:watch` für die Entwicklung.
- Party-Einstellungen (Party-Verwaltung im Dashboard):
  - **Auto-Fill aktivieren** — schaltet den 20s-Zyklus ein/aus.
  - **Automatikmodus** — "Automatisch einreihen" vs. "Erst als Vorschlag, ich
    bestätige".
  - **Zielgröße Queue** — die Schwelle, bis zu der aufgefüllt wird.
- Trend-Chip erscheint auf `/display` erst ab 10 gespielten Titeln mit bekannten
  Merkmalen (siehe `MIN_TRACKS_FOR_TREND`).
- Vorschläge (Modus "suggest") stehen in der Party-Verwaltung unterhalb von
  "Einstellungen speichern und Queue befüllen" — dort ggf. runterscrollen.
