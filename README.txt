mainabdichter Version 8.3

KORRIGIERTE LEXWARE-ARTIKELLOGIK

Von Lexware werden unverändert übernommen:
- Artikel-ID
- Artikelnummer
- Artikelname
- Artikeltext / Beschreibung
- Einheit
- Steuersatz

Nicht aus Lexware übernommen wird der Preis.

Der Preis stammt immer aus:
- der Berechnung der App bei Horizontalsperre, Flächensperre, Harz und Wand-Sohlen-Anschluss
- dem in der App gespeicherten Standardpreis bei Baustelleneinrichtung, Sauberkeitspaket und anderen Zusatzleistungen

Damit kann beispielsweise der Lexware-Artikel 'Baustelleneinrichtung' verwendet werden,
während der Preis in der App dauerhaft auf den gewünschten Betrag eingestellt wird.
Der Lexware-Artikeltext bleibt vollständig unverändert.

SONDERAKTION UND SKONTO
- Eine Sonderaktion verändert den aus der App kommenden Positionspreis anteilig.
- Skonto bleibt eine Zahlungsbedingung des Gesamtangebots.
- Titel, Text, Einheit und Steuersatz des Lexware-Artikels bleiben unverändert.

GITHUB
Zu ersetzen:
- js/app.js

Die übrigen Dateien können unverändert bleiben.

CLOUDFLARE
Keine Änderung am Worker gegenüber Version 8.2 erforderlich.
Die Worker-Datei ist trotzdem im Paket enthalten.
