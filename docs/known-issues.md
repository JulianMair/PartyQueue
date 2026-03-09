# Known Issues

## FooterPlayer lädt manchmal nicht
- Der Player initialisiert nicht immer zuverlässig.
- Ursache aktuell unklar.
- Prüfen: Token-Handling, Current Playback Fetch, useEffect-Abhängigkeiten, Race Conditions.

## Party geht nach Reload verloren
- Wenn eine Party erstellt wird und die Seite neu geladen wird, ist der aktuelle Party-Zustand weg.
- Aktuell ist die Queue nur im Speicher vorhanden.
- Dadurch muss eine neue Party erstellt werden und alle Songs sind verloren.
- Dieses Verhalten soll behoben werden.

## PartyQueue ist aktuell nicht persistent
- PartyManager / PartyRegistry arbeiten derzeit nur in Memory.
- Kein Wiederherstellen nach Reload oder Server-Neustart.