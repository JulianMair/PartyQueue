# PartyQueue Autofill, Product Backlog und Kanban Board

Branch: `Feature-Autofill-Playlist`
Methode: Kanban (kontinuierlicher Fluss), angepasst für Einzelarbeit.

Ablage im Repo unter `docs/agile/board.md`. Beim Arbeiten hältst du das Board aktuell: Karte von Ready nach In Progress ziehen, nach dem Bauen nach In Review, nach deiner eigenen Prüfung nach Done.

Spalten: **Backlog → Ready → In Progress → In Review → Done**

---

## Explizite Regeln (Kanban Policies)

- **WIP Limit In Progress: 1.** Es wird immer nur an einer Story gleichzeitig gearbeitet.
- **WIP Limit In Review: 2.** Damit fertiger Code nicht ungeprüft aufläuft und pauschal durchgewunken wird.
- **Definition of Ready** (Karte darf von Backlog nach Ready): Ziel und Akzeptanzkriterien klar, Abhängigkeiten erledigt, in einem Zug umsetzbar.
- **Definition of Review** (Karte darf von In Progress nach In Review): Code geschrieben, committet, Tests laufen, aber noch nicht durch den Product Owner geprüft.
- **Definition of Done** (Karte darf von In Review nach Done): Akzeptanzkriterien einzeln geprüft und erfüllt, Code gelesen und verstanden, Spotify Player funktioniert weiterhin, keine Secrets im Code, Board aktualisiert.
- **Rollenanpassung Einzelarbeit:** Es gibt kein zweites Teammitglied für das Review. Die Spalte In Review bedeutet daher: gebaut, aber noch nicht durch den Product Owner in Personalunion geprüft. Dieser Kontrollpunkt ersetzt das Vier Augen Prinzip.
- **Commit Konvention:** jeder Commit mit Story ID, z. B. `[US B1] ReccoBeats Provider mit Cache`.
- **Reihenfolge:** Risiko zuerst. B1 und B2 vor allem anderen, damit die Tragfähigkeit früh feststeht.
- **Schutzregel:** Player, Wiedergabe, Queue und Voting werden nicht verändert, außer eine Story verlangt es ausdrücklich.

---

## Product Backlog

| ID | Epic | User Story | Prio | SP |
|----|------|-----------|------|----|
| A1 | Datenerfassung | Als System möchte ich jeden gespielten Titel mit Zeitstempel speichern, damit eine Datengrundlage entsteht. | Hoch | 3 |
| A2 | Datenerfassung | Als System möchte ich die letzten N Titel einer Session abrufen, damit das Profil berechnet werden kann. | Hoch | 2 |
| B1 | Merkmale | Als System möchte ich Audio Merkmale über einen austauschbaren Provider beziehen, damit ich die toten Spotify Endpunkte umgehe. | Hoch | 5 |
| B2 | Merkmale | Als System möchte ich bei Ausfall des Providers auf Spotify Daten zurückfallen, damit das Feature robust bleibt. | Hoch | 5 |
| C1 | Trend | Als System möchte ich ein zeitgewichtetes Party Profil berechnen, damit der aktuelle Charakter der Party abgebildet wird. | Mittel | 5 |
| C2 | Trend | Als Gastgeber möchte ich erkennen, wohin sich die Stimmung bewegt, damit ich die Entwicklung des Abends nachvollziehen kann. | Mittel | 5 |
| E1 | Anzeige | Als Gast möchte ich den erkannten Trend auf dem Party Bildschirm sehen, damit die Funktion sichtbar wird. | Mittel | 3 |
| D1 | Empfehlung | Als System möchte ich einen Kandidatenpool erzeugen, damit es eine Auswahl zum Ranking gibt. | Mittel | 5 |
| D2 | Empfehlung | Als System möchte ich Kandidaten nach Ähnlichkeit zum Profil ranken, damit die passendsten Titel oben stehen. | Mittel | 5 |
| D3 | Empfehlung | Als Gastgeber möchte ich die Warteschlange automatisch auffüllen lassen, damit die Musik nie aussetzt. | Mittel | 3 |
| D4 | Empfehlung | Als Gastgeber möchte ich Empfehlungen erst bestätigen können, damit ich die Kontrolle behalte. | Niedrig | 2 |
| E2 | Anzeige | Als Gastgeber möchte ich Schwelle und Modus einstellen, damit ich das Verhalten anpassen kann. | Niedrig | 2 |
| F1 | Qualität | Als Entwickler möchte ich die Kernlogik automatisiert testen, damit die Qualität gesichert ist. | Mittel | 5 |
| F2 | Qualität | Als Entwickler möchte ich die Empfehlungsqualität mit Testpersonen bewerten, damit ich Ergebnisse belegen kann. | Mittel | 3 |
| G1 | Doku | Als Entwickler möchte ich Verfahren und Architektur dokumentieren, damit das Feature nachvollziehbar ist. | Mittel | 3 |

Summe: 15 Stories, 56 Story Points. Prio ist Planung, keine Zusage. Die tatsächliche Reihenfolge dokumentierst du im Board.

---

## Kanban Board

Startzustand. Beim Arbeiten verschiebst du die Karten zwischen den Spalten.

### Backlog
_(leer)_

### Ready
G1 · Technische Dokumentation · 3 SP

### In Progress  (WIP Limit: 1)
_(leer)_

### In Review  (WIP Limit: 2)
_(leer)_

### Done
- A1 · Gespielte Titel erfassen · 3 SP
- A2 · Stimmungsverlauf bereitstellen · 2 SP
- B1 · Audio-Merkmale über austauschbaren Provider · 5 SP
- B2 · Rückfallverfahren bei Ausfall · 5 SP
- C1 · Party Profil berechnen · 5 SP
- C2 · Trend ableiten · 5 SP
- E1 · Trend auf dem Display zeigen · 3 SP
- D1 · Kandidaten erzeugen · 5 SP
- D2 · Kandidaten ranken · 5 SP
- D3 · Automatisches Auffüllen · 3 SP
- D4 · Vorschlagsmodus statt Automatik · 2 SP
- E2 · Einstellungen für den Automatikmodus · 2 SP
- F1 · Automatisierte Tests · 5 SP
- F2 · Nutzerevaluation · 3 SP

---

## Arbeitstagebuch (kurz halten, drei Zeilen pro Tag)

| Datum | Erledigt | Nächster Schritt | Hindernis |
|-------|----------|------------------|-----------|
| 2026-09-05 | A1 gebaut: Historie gespielter Titel mit Zeitstempel, im Party-State gespeichert. Reine Logik mit 14 Prüfungen abgesichert. | A1 prüfen lassen, danach nächste Karte aus Ready. | Dev-Server erreicht MongoDB nicht (Server-Discovery scheitert über VPN, Direktverbindung klappt). Persistenz daher nur strukturell geprüft, nicht im Betrieb. |
| 2026-09-05 | A2 gebaut: Abruf der letzten N Titel als reine Funktion plus Lese-Methode am PartyManager. 15 Prüfungen inkl. Grenzfälle. | A1 und A2 prüfen lassen. In Review ist damit voll (WIP 2). | DB weiterhin nur per Direktverbindung erreichbar, daher kein Betriebstest. |
| 2026-09-05 | B1 gebaut: ReccoBeats als Merkmals-Anbieter unter providers/reccobeats/, Schnittstelle in types.ts, Auswahl über die bestehende factory.ts. Zwischenspeicher im Arbeitsspeicher. 13 Prüfungen gegen die echte API. | B1 prüfen lassen, danach B2 (Rückfallverfahren) aus Ready. | Merkmale werden einzeln geholt (die API bietet dafür keine Sammelabfrage), rund 0,5 s pro neuem Titel. Mit Zwischenspeicher unkritisch, bei leerem Speicher aber spürbar. |
| 2026-09-05 | B2 gebaut: Rückfallverfahren, das Merkmale aus Künstler-Genres schätzt, plus Verkettung der Anbieter. Herkunft (gemessen/geschätzt) steht am Ergebnis. 14 Prüfungen. | B1 und B2 prüfen lassen. In Review ist damit voll. | Der Rückfall-Anbieter selbst lief nur in Einzelteilen geprüft: er hängt über auth.ts am Next.js-Kontext und startet außerhalb davon nicht. |
| 2026-09-14 | C1 gebaut: reine Funktion `computePartyProfile` (partyProfile.ts) berechnet aus gespielten Titeln ein zeitgewichtetes Profil (tempo/energy/danceability/valence), exponentieller Zerfall mit 15 Min. Halbwertszeit, ab 5 Titeln mit Merkmalen. PartyManager holt dafür die Merkmale der letzten 30 gespielten Titel über die bestehende Anbieter-Kette und rechnet nach jedem gestarteten Titel neu (Hintergrund, nicht blockierend). 9 Prüfungen. | C1 prüfen lassen. Karte bleibt bewusst in In Progress statt In Review, weil In Review mit B1/B2 schon voll ist (WIP Limit 2) — siehe Hindernis. | In Review ist mit B1 und B2 bereits am WIP Limit (2). C1 fertig, aber noch nicht einsortiert — Julian entscheidet: B1/B2 zuerst nach Done, oder Limit für diesen Fall anheben. |
| 2026-09-14 | Entscheid: B1 und B2 nach eigener Prüfung nach Done verschoben, damit C1 regulär nach In Review kann. | C1 prüfen lassen, danach nächste Karte aus Backlog nach Ready holen. | — |
| 2026-09-14 | C1 nach eigener Prüfung nach Done verschoben. | C2 (Trend ableiten) aus Ready starten. | — |
| 2026-09-14 | C2 gebaut: reine Funktion `computePartyTrend` (partyTrend.ts) vergleicht Durchschnitt der letzten 6 Titel gegen den Gesamtdurchschnitt der Session, liefert Drift je Dimension plus ein Label ("wird energischer" etc.), erst ab 10 Titeln mit Merkmalen. PartyManager berechnet Profil und Trend zusammen, keine zusätzlichen Netzwerkrufe. 10 Prüfungen. | C2 prüfen lassen. | — |
| 2026-09-14 | C2 nach eigener Prüfung nach Done verschoben. | E1 (Trend auf dem Display zeigen) aus Ready starten. | — |
| 2026-09-14 | E1 gebaut: `/api/party/display` liefert zusätzlich `trend: {label} \| null` (nur das Label, keine Rohwerte). `/display`-Seite zeigt bei vorhandenem Trend einen kleinen Chip neben "Aktueller Song". `/displayv2` (Charts-Ansicht) bewusst nicht angefasst. | E1 prüfen lassen. | ESLint lief nicht durch (vorbestehendes Config-Problem, fehlendes react-hooks-Plugin, unabhängig von dieser Story) — Typprüfung über tsc stattdessen. |
| 2026-09-16 | E1 nach eigener Prüfung nach Done verschoben. Separat (außerhalb dieser Feature-Stories) Ursache für "Party erstellen geht nicht" gefunden: Mongo-Verbindungs-Promise in mongodb.ts cached einen einmal fehlgeschlagenen Verbindungsversuch dauerhaft. Auf Wunsch nicht gefixt, nur Workaround (Server-Neustart) genannt — bleibt bewusst außerhalb des Feature-Scopes. | D1 (Kandidaten erzeugen) aus Ready starten. | Der Mongo-Cache-Bug bleibt ungefixt bestehen, bis separat entschieden. |
| 2026-09-16 | D1 gebaut: `candidatePool.ts` mit reinem `pickTrendingArtistIds` (angesagte Künstler nach Häufigkeit/Aktualität) und `mergeCandidatePools` (Dedup + Ausschluss), plus Orchestrator `buildCandidatePool`. Neue Provider-Methode `getArtistTopTracks` (Spotify-Implementierung, `/v1/artists/{id}/top-tracks`). Quellen: Top-Tracks angesagter Künstler + Genre-Suche aus den Party-Einstellungen. Schließt gespielte Titel, aktuelle Queue und laufenden Song aus. Auto-Fill in PartyRegistry unverändert, neue Logik wird nirgends automatisch aufgerufen. 10 reine Prüfungen + 7 Prüfungen gegen die echte API (inkl. Ende-zu-Ende: gespielter Titel → Künstler-ID → Top-Tracks). | D1 prüfen lassen. | — |
| 2026-09-16 | D1 nach eigener Prüfung nach Done verschoben. | D2 (Kandidaten ranken) aus Ready starten. | — |
| 2026-09-16 | D2 gebaut: `candidateRanking.ts` mit reinem `cosineSimilarity` + `rankCandidates` (rankt Kandidaten mit bekannten Merkmalen nach Ähnlichkeit zum Profil-Vektor aus C1, deterministisch per Track-ID-Tie-Break, kurze Erklärung je Kandidat anhand der nächsten Dimension), plus Orchestrator `rankCandidatePool` (holt Merkmale über die bestehende B1/B2-Kette, leer ohne Profil). Nirgends automatisch aufgerufen, wie D1. 8 reine Prüfungen. | D2 prüfen lassen. | — |
| 2026-09-16 | D2 nach eigener Prüfung nach Done verschoben. | D3 (Automatisches Auffüllen) aus Ready starten. | — |
| 2026-09-16 | D3 gebaut: bisherige genre-basierte Auto-Fill-Suche (`buildGenreQueries`/`analyzeVotePreferences`/`collectGenreTracks`) vollständig entfernt und durch `buildAutoFillCandidates` ersetzt, die auf D1 (Kandidatenpool) + D2 (Ranking) aufbaut. Ohne Profil (junge Party) wird der rohe Pool statt Ranking verwendet, damit die Warteschlange trotzdem auffüllt. Auswahl-Entscheidung als reine Funktion `selectAutoFillTracks` in eigener Datei (Explicit-Filter, Ausschluss zuletzt eingereihter Titel, Begrenzung). Aufrufer (`seedQueueFromSettings`, `runAutoFillCycle`) und ihre Gates unverändert — genau ein Auffüll-Mechanismus. 9 reine Prüfungen. | D3 prüfen lassen — hier besonders wichtig: kurzer manueller Test im laufenden Betrieb (Party mit aktiviertem Auto-Fill), da diese Story erstmals die produktive Queue-Logik anfasst. | Kein Betriebstest der ganzen Kette durch mich möglich (Spotify-Login/Next.js-Kontext nötig, siehe B1/B2). Nur tsc + reine Prüfungen + sorgfältiges Lesen des Diffs. |
| 2026-09-16 | D3 im Betrieb getestet (Dev-Server neu gestartet, echte Party mit Auto-Fill): 7 Titel sauber nachgefüllt, Trend-Chip korrekt, keine Fehler. Danach auf Julians Wunsch die Genre-Auswahl komplett aus UI, PartySettings und dem Kandidatenpool entfernt (war die zweite von zwei D1-Quellen) — candidatePool.ts liefert jetzt nur noch über angesagte Künstler. | D3 (inkl. Genre-Entfernung) prüfen lassen. | — |
| 2026-09-16 | D3 nach eigener Prüfung nach Done verschoben. | D4 (Vorschlagsmodus statt Automatik) aus Ready starten. | — |
| 2026-09-16 | Ausserhalb der Feature-Stories: Bug in party/[id]/vote/page.tsx behoben (Vorexistent, nicht durch dieses Feature verursacht) — Race Condition zwischen optimistischem Vote-Update und dem 1,5s-Polling liess Votes kurz nach dem Klick wieder auf den alten Stand zurueckspringen. Fix: kurzes Ignorierfenster (lastLocalVoteAtRef, 2,5s) fuer Poll-Antworten nach einem eigenen Vote. Dev-Server neu gestartet. | D4 aus Ready starten. | Testete im laufenden Dev-Server unter staendigen Fast-Refresh-Zyklen unzuverlaessig — Server-Neustart hat das behoben, Julian prueft den Fix selbst. |
| 2026-09-17 | D4 gebaut: neue Einstellung `autoFillMode` ("auto"/"suggest"). Im Vorschlagsmodus legt PartyRegistry ausgewaehlte Auto-Fill-Titel als `pendingRecommendations` am PartyManager ab statt sie einzureihen (neue Methoden addPendingRecommendations/confirmRecommendation/rejectRecommendation, persistiert wie playedTracks). Neue Route `/api/party/recommendations` (confirm/reject), Party-Verwaltung zeigt Vorschlagsliste mit ✓/✕. Zielgroessen-Zaehlung beruecksichtigt wartende Vorschlaege, damit nicht bei jedem Zyklus weiter nachgelegt wird. Gast-Song-Vorschlaege (bestehende Suggestion-Funktion) unangetastet. 13 Pruefungen der neuen PartyManager-Methoden (inkl. Persistenz-Rundlauf). | D4 pruefen lassen — auch hier ein kurzer Betriebstest empfohlen (Vorschlagsmodus aktivieren, Vorschlag bestaetigen/verwerfen), da PartyRegistry-Orchestrierung betroffen ist. | Die neue PartyRegistry-Verzweigung (applySelectedTracks/countTowardsTarget) selbst nur per Code-Review geprueft, nicht live — Verhalten von D3 ist als Regressionstest mit abgedeckt (Pruefungen bestehen weiter). |
| 2026-09-17 | D4 nach eigener Prüfung nach Done verschoben. | E2 (Einstellungen für den Automatikmodus) aus Ready starten. | — |
| 2026-09-17 | E2 ohne neuen Code direkt nach Done verschoben: "Schwelle" (targetQueueSize) und "Modus" (autoFillMode) sind bereits einstellbar und werden aktiv von PartyRegistry.seedQueueFromSettings/runAutoFillCycle verwendet (Stories D3/D4) — kein Karteileichen-Feld, direkt im Empfehlungs-Pfad verdrahtet. | F1 (Automatisierte Tests) aus Ready starten. | — |
| 2026-09-17 | F1 gebaut: Vitest 2 als Dev-Dependency (kompatibel zu vorhandenem @types/node ^20), `npm test`/`npm run test:watch`. 61 Tests in 7 Dateien — dauerhafte Fassung aller bisherigen Ad-hoc-Prüfungen für die reinen Funktionen aus A1/A2, C1, C2, D1 (nur pickTrendingArtistIds/mergeCandidatePools), D2, D3/D4, plus settings.ts. Orchestratoren mit echtem I/O (buildCandidatePool, rankCandidatePool, Provider, PartyManager/PartyRegistry) bewusst nicht getestet — brauchen echte API/DB-Anbindung. `npm test` und `tsc --noEmit` laufen beide fehlerfrei. | F1 prüfen lassen. | `npm audit` zeigt Schwachstellen in transitiven Vitest-Abhängigkeiten (Dev-only) — nicht behoben, nur zur Kenntnis. |
| 2026-09-18 | F1 nach eigener Prüfung nach Done verschoben. | F2 (Nutzerevaluation) aus Ready starten. | — |
| 2026-09-18 | F2 ohne neuen Code erledigt: simulierter Mehr-Nutzer-Durchlauf auf der laufenden Party über die echten APIs (vier Client-IDs, gleichzeitiges Voting inkl. Duplikat-/Unvote-Prüfung, ein voller Bestätigen/Verwerfen-Durchlauf für D4). Empfehlungen fachlich als konsistent zur Party-Richtung eingeschätzt (angesagter Künstler + bereits vorkommender Mashup-Artist). Julian hat auf die zusätzliche 👍/👎-Bewertungsfunktion verzichtet, direkt nach Done. | G1 (Technische Dokumentation) aus Ready starten. | Echte Songwiedergabe (playedTracks) konnte ohne verbundenes Spotify-Gerät nicht simuliert werden — Profil/Trend basieren auf der bereits vorhandenen echten Historie, nicht auf von mir erzeugten Plays. |
