# Architektur

## Überblick

Die App besteht aus drei Hauptbereichen:

1. Host-Dashboard
2. PartyManager / Backend-Logik
3. Mobile Voting-Seite

## Datenfluss

### Host
- loggt sich mit Spotify ein
- sieht Playlists
- fügt Songs zur PartyQueue hinzu
- startet eine Party
- zeigt QR-Code an

### PartyManager
- verwaltet `PartyState`
- hält die interne Queue
- verarbeitet Votes
- synchronisiert den aktuellen Track mit Spotify

### Mobile Clients
- öffnen die Voting-Seite per QR-Code
- sehen Top 10 Songs
- können Songs upvoten
- dürfen nur einmal pro Song voten

## Wichtige Prinzipien

- Die interne Queue ist die Wahrheit
- Spotify ist nur das Abspielsystem
- Votes wirken auf die interne Sortierung
- Mobile Voting bleibt minimal