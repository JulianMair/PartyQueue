# Deployment auf Unraid

## Build-Strategie

- Docker Image wird per GitHub Actions gebaut
- Push zu Docker Hub
- Unraid zieht das Image von Docker Hub

## Voraussetzungen

- Docker Hub Repository
- GitHub Secrets für Docker Hub
- GitHub Secrets für Spotify ENV
- Extern laufender MongoDB-Container (separat deployt)
- Reverse Proxy mit HTTPS für Produktion

## GitHub Secrets

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`
- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `SPOTIFY_REDIRECT_URI`
- `NEXT_PUBLIC_BASE_URL`
- `MONGODB_URI`
- `MONGODB_DB_NAME` (optional, default: `partyqueue`)

## Wichtig

- Produktionswerte müssen im Build verfügbar sein
- Spotify OAuth braucht HTTPS
- Nach Änderungen an ENV oder Redirect URIs Container neu bauen und neu deployen
- MongoDB wird **nicht** über das App-Image gestartet; Verbindung erfolgt nur über ENV

## Unraid ENV-Konfiguration (App-Container)

Setze im App-Container mindestens:

- `MONGODB_URI`
  Beispiel:
  `mongodb://<user>:<password>@<mongo-host>:27017/partyqueue?authSource=admin`
- `MONGODB_DB_NAME` (optional)
  Beispiel: `partyqueue`

Zusätzlich weiterhin:

- `NEXT_PUBLIC_BASE_URL`
- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `SPOTIFY_REDIRECT_URI`
