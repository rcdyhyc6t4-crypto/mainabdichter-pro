mainabdichter PRO V32.15.0 – Cloud-Migration
================================================

Neu:
- Eigener Bereich „Mehr → Cloud-Migration“
- Dropbox und Microsoft OneDrive als Quellen
- Google Drive als Ziel
- Einzelne Dateien, ausgewählte Ordner oder vollständige Ordnerbäume
- Ursprüngliche Ordnerstruktur bleibt erhalten
- Quellen werden ausschließlich gelesen und niemals gelöscht
- Bereits vorhandene Dateien mit gleichem Namen und gleicher Größe werden übersprungen
- Fortschritt, kopierte Datenmenge und Fehlerprotokoll
- Ein abgebrochener Lauf kann ohne Dubletten erneut gestartet werden

Zielstruktur in Google Drive:
Cloud-Migration/
  Dropbox/
  OneDrive/

Zusätzliche Cloudflare-Worker-Secrets:

Dropbox:
- DROPBOX_APP_KEY
- DROPBOX_APP_SECRET
- DROPBOX_REFRESH_TOKEN

Microsoft OneDrive:
- MS_CLIENT_ID
- MS_CLIENT_SECRET
- MS_REFRESH_TOKEN
- MS_TENANT_ID (optional; Standard: common)

Google Drive verwendet unverändert:
- GOOGLE_CLIENT_ID
- GOOGLE_CLIENT_SECRET
- GOOGLE_REFRESH_TOKEN

Benötigte Berechtigungen:
- Dropbox: files.metadata.read, files.content.read
- Microsoft Graph: offline_access, Files.Read, User.Read
- Google Drive: vorhandene Drive-Berechtigung der App

Sicherheit:
- OAuth-Zugangsdaten liegen ausschließlich als verschlüsselte Worker-Secrets bei Cloudflare.
- Im Browser und in der App-Sicherung werden keine Dropbox- oder Microsoft-Tokens gespeichert.
- Die Migration kopiert nur. Quelldateien werden nicht verschoben, verändert oder gelöscht.

