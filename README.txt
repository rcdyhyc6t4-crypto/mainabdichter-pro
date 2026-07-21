mainabdichter Version 9.1 – Speicherung und Verbindungstest

BEHOBEN
- Worker-URL und APP_SECRET werden zuverlässig gespeichert.
- Die Werte werden zusätzlich separat im Browser gespeichert.
- Nach einem Neuladen werden beide Felder automatisch wiederhergestellt.
- Der allgemeine Button 'Einstellungen speichern' speichert ebenfalls die Schnittstellen.
- Bereits eingetragene, aber noch nicht gespeicherte Zugangsdaten können beim Verbindungstest direkt verwendet werden.

NEU
- Button 'Zugangsdaten speichern'
- Button 'Verbindungen testen'
- getrennte Statusanzeigen für:
  - Cloudflare Worker
  - Lexware Office
  - Pipedrive
- Lexware-Artikel können erst nach erfolgreicher Speicherung zuverlässig geladen werden.
- Bei falschem APP_SECRET wird der Fehler direkt angezeigt.

GITHUB
Die vollständige Struktur kann hochgeladen werden.
Bei bereits installierter V9 reichen:
- index.html
- styles.css
- js/app.js

CLOUDFLARE
Der Worker ist gegenüber V9 inhaltlich unverändert und liegt vollständig im Paket.
