mainabdichter PRO V30.5.1 – belastbare Kundenbasis

NEU UND BEHOBEN
- Telefonnummer und Mobilnummer sind getrennt.
- WhatsApp erscheint bei einer hinterlegten Mobilnummer oder bei einer
  erkannten deutschen Mobilnummer im bisherigen Telefonfeld.
- Pipedrive überträgt Telefon- und Mobilnummer mit passenden Kennzeichnungen.
- Eine bewusst abweichende Objektadresse bleibt bei einer Aktualisierung aus
  Pipedrive erhalten.
- Unvollständige Pipedrive-Suchergebnisse löschen keine vorhandenen Kunden-
  oder Adressdaten mehr.
- Der Worker unterscheidet die Kundenhistorie jetzt sicher vom Abruf einer
  einzelnen Pipedrive-Person. `customer-history` kann nicht mehr irrtümlich als
  Personen-ID an Pipedrive gesendet werden.
- Automatische Objektadresse, Speicheranzeige und konkrete Fehlermeldungen
  bleiben erhalten.

TESTS
- npm install
- npm run build
- npm test

UPLOAD
- Das vollständige ZIP kann in Working Copy über das bestehende Repository
  mainabdichter-pro entpackt werden.
- Danach Commit und Push.
- cloudflare-worker.js muss bis zur Einrichtung der automatischen Bereitstellung
  weiterhin im bestehenden Cloudflare Worker veröffentlicht werden.
