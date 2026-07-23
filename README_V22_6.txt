mainabdichter V22.6 – komplette Version mit Baustellenunterlagen

Neu:
- Bilder und PDFs im Baustellenbericht hinzufügen
- Kategorien: Grundriss, Gebäudequerschnitt, Schadensbild, Messstelle, Vorher, Während, Nachher, Herstellerunterlage, Sonstiges
- Bemerkung pro Datei
- lokale Speicherung in IndexedDB, damit auch größere PDFs nicht den normalen App-Speicher blockieren
- automatischer Upload aller offenen Dateien zum zugehörigen Pipedrive-Deal
- Uploadstatus und erneuter Versuch bei Fehlern
- vorhandene Maßnahmenfotos werden beim Pipedrive-Sync ebenfalls hochgeladen
- Baustellenabschluss erfolgt nur vollständig, wenn Bericht und Unterlagen erfolgreich übertragen wurden

Installation:
- vollständigen ZIP-Inhalt in GitHub ersetzen
- Cloudflare-Worker ist enthalten; gegenüber V22.5 wurde die Uploadroute nicht verändert
