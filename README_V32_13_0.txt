mainabdichter PRO V32.13.0
===========================

Geräte-Synchronisierung für iPhone und iPad

- Google-Drive-Datensicherung wird jetzt auch zurück in die App geladen.
- Beim App-Start wird ein neuerer gemeinsamer Datenstand automatisch übernommen.
- Beim Zurückkehren in die App wird erneut auf Änderungen geprüft.
- Vor jeder neuen Drive-Sicherung wird zuerst der gemeinsame Stand abgeglichen.
- Der Dashboard-Abruf lädt zuerst die gemeinsamen App-Daten und anschließend Pipedrive.
- Ein leerer oder älterer Gerätebestand überschreibt nicht mehr automatisch eine
  neuere Datensicherung.
- Alle bisherigen Funktionen aus V32.12.2 bleiben enthalten.

Wichtig:
Auf iPhone und iPad müssen dieselbe Worker-Verbindung und derselbe APP_SECRET
eingerichtet sein. Danach erfolgt der Abgleich automatisch über dieselbe
Google-Drive-Datensicherung.
