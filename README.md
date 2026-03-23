# PartyQueue

PartyQueue ist eine Spotify-basierte Party-Voting-App.

Ein Host startet eine Party, zeigt einen QR-Code an und Gäste können über eine mobile Voting-Seite Songs upvoten. Die interne PartyQueue ist die Quelle der Wahrheit. Spotify wird nur als Abspielsystem verwendet.

## Hauptfunktionen

- Host-Dashboard
- Spotify-Login
- Playlist-Auswahl
- Songs zur PartyQueue hinzufügen
- Mobile Voting per QR-Code
- Pro Gerät nur ein Vote pro Song
- Top-10-Voting-Liste für mobile Geräte
- Docker-Deployment für Unraid
- CI/CD über GitHub Actions + Docker Hub

## Tech-Stack

- Next.js 15
- TypeScript
- Tailwind CSS
- Spotify Web API
- Docker
- Unraid
- GitHub Actions
- MongoDB (externer Container)

## Projektstruktur

- `src/app/lib/party/PartyManager.ts`  
  Zentrale Party- und Queue-Logik

- `src/app/lib/providers/`  
  Musikprovider-Architektur, aktuell Spotify

- `src/app/api/auth/`  
  Spotify OAuth Login, Callback, Token-Refresh

- `src/app/party/[id]/vote/page.tsx`  
  Mobile Voting-Seite

## Lokale Entwicklung

```bash
npm install
npm run dev
```

## Persistente Party-Verwaltung (MongoDB)

Partys und Queue-Daten werden persistent in MongoDB gespeichert.
Die interne `PartyQueue` im `PartyManager` bleibt die Quelle der Wahrheit.
`PartyRegistry` bleibt als Runtime-Cache aktiv und synchronisiert Änderungen in MongoDB.

### Datenmodell (vereinfacht)

Collection: `parties`

- `partyId` (string, unique)
- `name` (string)
- `providerName` (string, aktuell `spotify`)
- `isActive` (boolean)
- `createdAt`, `updatedAt` (Date)
- `state` (PartyState inkl. `queue`, `currentTrack`, `isActive`)
- `votedByClient` (Record `<clientId, trackIds[]>`)
- `settings`:
  - `genres` (z. B. Rock, Hip-Hop, Pop, Techno, House, 90s, EDM)
  - `autoFillEnabled` (Vorbereitung für spätere Auto-Queue-Logik)
  - `targetQueueSize` (z. B. 20)
  - `allowExplicit` (true/false)
  - `fadeSeconds` (0-12 Sekunden Übergang beim Trackwechsel)

Damit ist die Struktur bereits geeignet, um große PartyQueues inkl. aus Playlists importierter Tracks zu speichern.

### Relevante API-Endpunkte

- `POST /api/party/create` Party erstellen (und aktivieren)
- `GET /api/party/list` Partys auflisten
- `POST /api/party/load` Party laden/aktivieren
- `POST /api/party/delete` Party löschen
- `POST /api/party/settings` Party-Settings speichern und genrebasierte Queue-Befüllung auslösen

### Erste genrebasierte Queue-Befüllung

Wenn in den Party-Settings Genres gesetzt sind, werden bei Erstellung und beim Speichern der Settings
passende Songs über die bestehende Spotify-Suche geholt und in die interne PartyQueue eingefügt.

- nutzt `genres` + `targetQueueSize` als Ziel
- mischt Ergebnisse aus mehreren Genres
- vermeidet Duplikate gegen bestehende Queue
- berücksichtigt `allowExplicit` (wenn `false`, werden explizite Tracks herausgefiltert)
- bei aktivem `autoFillEnabled` läuft fortlaufend ein Auto-Fill-Zyklus:
  - wenn die Queue unter Zielgröße fällt, werden bis zu 2 passende Songs ergänzt
  - wenn die Queue auf Zielgröße ist, bleibt sie stabil (es wird nichts entfernt)
  - zusätzlich analysiert Auto-Fill hoch gevotete Songs (Artist/Track-Signale) und nutzt diese als Such-Boost

## API-Auth-Schutz

Sensitive Host- und Verwaltungs-Endpunkte sind zentral über `src/middleware.ts` geschützt.
Eine Anfrage gilt als angemeldet, wenn mindestens einer der Cookies vorhanden ist:

- `spotify_access_token`
- `spotify_refresh_token`

### Öffentlich erlaubt (bewusst ohne Login)

- `GET /api/party/mobile` (Top-10 für Gäste)
- `POST /api/party/vote` (Voting/Unvote für Gäste)
- `POST /api/party/join` (Gastbeitritt)
- OAuth-Endpunkte unter `/api/auth/*` (`login`, `callback`, `token`, `refresh`)

### Login erforderlich

- alle übrigen Endpunkte unter `/api/music/*`
- alle übrigen Endpunkte unter `/api/party/*` (z. B. `create`, `delete`, `load`, `add`, `add-playlist`, `remove`, `reorder`, `next`, `list`, `active`, `state`, `status`)
- Host-Dashboard unter `/dashboard/*`

### ENV für externe MongoDB

Siehe `.env.example`:

- `MONGODB_URI` (Pflicht)
- `MONGODB_DB_NAME` (optional, default `partyqueue`)
