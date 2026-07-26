mainabdichter PRO V32.14.0

Priorität 1: sichere Geräte- und Browser-Synchronisierung

- Ein neuer Browser darf keine leere Sicherung über Google Drive schreiben.
- Vor dem ersten Upload wird der zentrale Datenstand zwingend geprüft.
- Vorhandene zentrale Daten werden beim Einrichten zuerst geladen.
- Bereits vorhandene lokale und zentrale Kunden, Angebote und Baustellen
  werden anhand ihrer IDs und Änderungszeiten zusammengeführt.
- Ein Upload basiert auf der zuletzt gelesenen Drive-Dateiversion.
- Hat ein anderes Gerät die Sicherung inzwischen geändert, lehnt der Worker
  den veralteten Upload mit HTTP 409 ab. Die App lädt und vereinigt zuerst
  den neueren Datenstand.
- APP_SECRET und Worker-Adresse des funktionierenden Geräts bleiben erhalten.
- Termin-Zeitzonenlogik aus V32.13.9 bleibt enthalten.

V32.14.0 ersetzt V32.13.9.
