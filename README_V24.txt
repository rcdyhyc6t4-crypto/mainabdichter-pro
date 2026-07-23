mainabdichter PRO V24

Änderungen:
- Cloudflare-Worker aus V23.2 inklusive echter Pipedrive-Adressübernahme enthalten.
- Lagerbestand auf dem Dashboard sichtbar.
- Aktive Lagerartikel zeigen Bestand, Einheit und Mindestbestand.
- Gelbe Warnung bei Mindestbestand oder darunter.
- Rote Warnung bei leerem Bestand.
- Klick auf einen Lagerartikel öffnet die Lagerverwaltung.
- Es wird dieselbe Lagerdatenquelle wie bei Baustellen und Einstellungen verwendet; keine doppelte Pflege.
- Änderungen und Materialabbuchungen werden sofort auf dem Dashboard angezeigt.

Deployment:
1. Gesamten Inhalt auf GitHub Pages ersetzen.
2. cloudflare-worker.js im Cloudflare Worker veröffentlichen.
3. Browser/PWA-Cache neu laden.
