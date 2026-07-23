mainabdichter V20 – vollständige Pipedrive-Deal-Synchronisation

NEU
- Pipedrive-Dealphasen direkt aus dem eigenen Konto laden
- benutzerdefinierte Pipedrive-Deal-Felder direkt aus dem eigenen Konto laden
- automatische Zuordnung anhand der Feldnamen
- manuelle Kontrolle und Korrektur jeder Zuordnung
- Zuordnung wird in der Komplettsicherung gespeichert
- Screenshot-Anfrage erzeugt Kontakt und Deal in der Phase „Anfragen“
- Pipedrive-Termine übernehmen Person-ID und Deal-ID in die Besichtigung
- Lexware-Angebot synchronisiert Angebotsdaten und Phase „Angebot versendet“
- heute angenommene Lexware-Angebote erzeugen eine Baustelle und aktualisieren die Phase „Ausführung geplant“
- Baustellen- und Arbeitsnachweisdaten werden in zugeordnete Pipedrive-Deal-Felder geschrieben
- Arbeitsnachweis wird als echte PDF-Datei erzeugt und am richtigen Pipedrive-Deal hochgeladen
- Besichtigungs- und Messprotokoll wird als echte PDF-Datei erzeugt und am Deal hochgeladen
- Baustellenabschluss aktualisiert die Phase „Ausführung abgeschlossen“
- Material wird erst nach erfolgreicher Pipedrive-Synchronisation und PDF-Upload abgebucht
- doppelte Materialabbuchung wird verhindert
- Bohrlochanzahl und Injektionsmenge je Bohrloch werden bei Änderung des Bohrlochabstands neu berechnet
- Synchronisationsprotokoll mit Erfolgen und Fehlern

EINMALIGE EINRICHTUNG
1. Vollständigen ZIP-Inhalt in GitHub hochladen und vorhandene Dateien ersetzen.
2. cloudflare-worker.js vollständig in Cloudflare ersetzen und neu bereitstellen.
3. App neu laden.
4. Einstellungen > Schnittstellen: Zugangsdaten speichern und Verbindungen testen.
5. Einstellungen > Pipedrive-Synchronisation: „Dealphasen und Felder laden“ drücken.
6. Automatisch vorgeschlagene Zuordnungen kurz kontrollieren und Einstellungen speichern.

WICHTIG
Die technischen Pipedrive-Felder besitzen in jedem Konto eigene interne Schlüssel. Deshalb müssen sie einmal aus deinem Konto geladen werden. Danach werden die Zuordnungen dauerhaft gespeichert und mit der Komplettsicherung auf andere Geräte übertragen.

PDF
Die PDF-Erzeugung nutzt jsPDF 2.5.1 über cdnjs. Beim ersten PDF-Aufruf ist daher eine Internetverbindung nötig. Die OCR-Texterkennung für Screenshot-Importe benötigt ebenfalls Internet.

CLOUDFLARE
Der Worker ist zwingend zu aktualisieren. Neu sind Routen für Deal-Felder, Dealphasen, Deal-Update, Notizen und PDF-Dateiupload.
