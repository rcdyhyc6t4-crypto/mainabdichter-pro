mainabdichter V20.1 Stable

WICHTIGE REPARATUR
- Mehrere Pipedrive-API-Funktionen waren in js/api.js doppelt definiert.
- Dadurch wurde app.js vom Browser nicht geladen und sämtliche Schaltflächen wirkten ohne Funktion.
- Die doppelten Definitionen wurden entfernt.
- Ein sichtbarer Startfehler-Hinweis wurde ergänzt, damit künftige Ladefehler nicht mehr unbemerkt bleiben.

ENTHALTEN
- Dashboard und Navigation
- Screenshot-Anfrageimport
- Pipedrive-Termine und Deal-Synchronisation
- Lexware-Kunden, Artikel, Angebote und angenommene Angebote ab heute
- Kundenansicht und PDFs
- Preisstrategie und Kleinmengenlogik
- Warenbestand
- Baustellenakte und Arbeitsnachweis
- Pipedrive-PDF-Upload
- Komplettsicherung und Wiederherstellung

INSTALLATION
1. Kompletten ZIP-Inhalt in GitHub hochladen und vorhandene Dateien ersetzen.
2. cloudflare-worker.js in Cloudflare einsetzen und neu bereitstellen.
3. Browser-/PWA-Cache vollständig aktualisieren.
4. Einstellungen > Verbindungen testen.
5. Pipedrive-Synchronisation > Dealphasen und Felder laden.
