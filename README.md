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

Damit ist die Struktur bereits geeignet, um große PartyQueues inkl. aus Playlists importierter Tracks zu speichern.

### Relevante API-Endpunkte

- `POST /api/party/create` Party erstellen (und aktivieren)
- `GET /api/party/list` Partys auflisten
- `POST /api/party/load` Party laden/aktivieren
- `POST /api/party/delete` Party löschen

### ENV für externe MongoDB

Siehe `.env.example`:

- `MONGODB_URI` (Pflicht)
- `MONGODB_DB_NAME` (optional, default `partyqueue`)
