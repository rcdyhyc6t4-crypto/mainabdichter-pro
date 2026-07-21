mainabdichter Version 9.0 – getrennte Kundenansicht

WICHTIGE ÄNDERUNGEN
- Separate customer.html für die Kundenansicht.
- Der Kunde kann nicht in Besichtigung, Messwerte, Kalkulation oder Einstellungen hochscrollen.
- Die Kundenansicht wird in einem neuen Browserfenster/Tab geöffnet.
- PDF-Erstellung erfolgt direkt aus der getrennten Kundenansicht.

KUNDENDATEN
- Kunde aus Pipedrive laden.
- Bestehenden Kunden aus Lexware laden.
- Lexware-Suche nach Name, E-Mail oder Kundennummer.
- Lexware-Kontakt-ID wird gespeichert und beim Angebot wiederverwendet.

LEXWARE-ARTIKEL
Einmalige Zuordnung unter Einstellungen:
- Horizontalsperre
- Flächensperre
- Harzverpressung
- Wand-Sohlen-Anschluss
- Kleinbaustellenzuschlag
- Standard-Zusatzleistungen wie Baustelleneinrichtung und Sauberkeitspaket

Aus Lexware bleiben erhalten:
- Artikel-ID und Artikelnummer
- Artikelname
- vollständiger Artikeltext
- Einheit
- Steuersatz

Nur der Preis wird aus der Berechnung bzw. den App-Einstellungen übernommen.
Die abweichenden Angebotsdaten verändern den Lexware-Stammartikel nicht.

NICHT AUTORISIERT
Wenn APP_SECRET oder Worker-URL fehlen bzw. nicht stimmen, öffnet die App die Einstellungen.
APP_SECRET in der App muss exakt dem Cloudflare-Secret APP_SECRET entsprechen.

GITHUB – KOMPLETTE STRUKTUR
- index.html
- customer.html
- styles.css
- customer.css
- manifest.json
- assets/bkm-logo.png
- js/app.js
- js/customer.js

CLOUDFLARE
- cloudflare-worker.js vollständig ersetzen
- Deploy drücken
