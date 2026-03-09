# Spotify Auth

## Auth-Fluss

1. Client ruft `/api/auth/login` auf
2. Weiterleitung zu Spotify mit:
   - `client_id`
   - `scope`
   - `redirect_uri`
3. Spotify leitet zurück zu `/api/auth/callback`
4. Callback tauscht `code` gegen Access- und Refresh-Token
5. Tokens werden in Cookies gespeichert

## Wichtige ENV Variablen

- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `SPOTIFY_REDIRECT_URI`
- `NEXT_PUBLIC_BASE_URL`

## Wichtige Hinweise

- Spotify benötigt in Produktion HTTPS
- Redirect URI muss exakt registriert sein
- Keine lokale IP mit HTTP in Produktion verwenden
- Docker-Build und ENV-Handling sorgfältig prüfen