mainabdichter V10.2 – korrekte Lexware-Positionslogik

LEXWARE-ÜBERGABE

Horizontalsperre
- quantity = Laufmeter
- unitName = lfm
- unitPrice.grossAmount = Preis je Laufmeter
- Lexware berechnet Menge × Einzelpreis

Flächensperre
- quantity = Quadratmeter
- unitName = m²
- unitPrice.grossAmount = Preis je Quadratmeter
- Lexware berechnet Fläche × Einzelpreis

Wand-Sohlen-Anschluss
- quantity = Laufmeter
- unitName = lfm
- unitPrice.grossAmount = Preis je Laufmeter

Harzverpressung
- quantity = Laufmeter
- unitName = lfm
- unitPrice.grossAmount = Preis je Laufmeter
- zusätzlicher Harz-Mehraufwand ist im berechneten Einzelpreis enthalten

Baustelleneinrichtung, Sauberkeitspaket und sonstige Pauschalen
- quantity = 1
- unitName = pauschal bzw. Lexware-Einheit
- unitPrice.grossAmount = vollständiger Pauschalpreis

SONDERAKTION
- Die Sonderaktion wird proportional auf die Einzelpreise verteilt.
- Mengen und Einheiten bleiben unverändert.
- Lexware-Artikeltexte, Artikelname, Einheit und Steuersatz bleiben aus Lexware erhalten.

SKONTO
- Skonto wird nicht in den Einzelpreis eingerechnet.
- Skonto wird als Zahlungsbedingung an Lexware übertragen.

AKTUALISIEREN
GitHub:
- js/calculator.js
- js/app.js

Cloudflare:
- keine Änderung gegenüber V10.1 erforderlich

DIAGNOSE
In der Browser-Konsole wird vor der Übertragung eine Liste ausgegeben:
Position: Menge Einheit × Einzelpreis.
