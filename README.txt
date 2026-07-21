mainabdichter Version 8.0

KERNLOGIK
- HZ 250 Pro Einkaufspreis netto je Liter wird einmal im Adminbereich gespeichert.
- Gewünschter HZ-Verkaufspreis netto je Liter wird einmal gespeichert.
- Horizontalsperre und Flächensperre berechnen den Literbedarf automatisch:
  - Faktor 14 für Horizontalsperre bzw. erste Reihe
  - Faktor 10 für weitere Reihen
  - horizontal 12,5 oder 25 cm
  - vertikal immer 25 cm
  - Materialreserve frei einstellbar
- Kleinbaustellen-Aufschlag unter 12 lfm:
  - fest oder prozentual
  - optional separat in Kundenansicht
- Harzverpressung:
  - Grundpreis aus der dauerhaften Preisliste
  - zusätzlicher kg-Mehraufwand separat

LEXWARE
- Kunde wird angelegt, sofern noch keine Lexware-Kontakt-ID gespeichert ist.
- Das vollständige Angebot wird als Lexware-Entwurf erstellt.
- Alle Positionen, Mengen, Preise, MwSt., Skonto und Objektanschrift werden übertragen.
- Optional können vorhandene Lexware-Artikel einmalig den Maßnahmen zugeordnet werden.
- Ohne Artikelzuordnung werden freie Leistungspositionen angelegt.

GITHUB
Gesamte Ordnerstruktur hochladen:
- index.html
- styles.css
- js/app.js
- assets/bkm-logo.png
- manifest.json

CLOUDFLARE
Die neue cloudflare-worker.js ist zwingend erforderlich:
- vorhandenen Worker-Code vollständig ersetzen
- Deploy drücken

WICHTIG
Falls der Lexware-API-Key vor Einführung des Angebots-Endpunkts erstellt wurde und Lexware den Zugriff verweigert,
muss in Lexware ein neuer Public-API-Key erzeugt und in Cloudflare bei LEXOFFICE_API_KEY rotiert werden.
