mainabdichter PRO V32.7.4
=========================

KORREKTUREN

- Blaue iPhone-Standardschrift bei Schaltflächen vollständig überschrieben.
- Graue Schaltflächen verwenden dunkelgraue Schrift.
- Grüne Hauptaktionen verwenden weiße Schrift.
- Versionsparameter für CSS, App-JavaScript und abhängige Module auf 32.7.4 erhöht.
- Arbeitsnachweis wird beim Baustellenabschluss tatsächlich in Google Drive hochgeladen.
- Baustellenfotos werden beim Abschluss ebenfalls in Google Drive hochgeladen.
- Google Drive wird unter Einstellungen > Verbindungen separat geprüft.
- Baustellenfotos werden komprimiert im größeren IndexedDB-Dateispeicher statt als
  große Textdaten im knappen localStorage abgelegt.
- Bereits vorhandene eingebettete Besichtigungs- und Baustellenfotos werden beim
  ersten Start automatisch aus dem knappen localStorage migriert.
- Abschlussmeldung bestätigt Google Drive, Pipedrive und Materialabbuchung getrennt.

UPLOAD

Den Inhalt dieses Ordners vollständig in das GitHub-Repository hochladen und
vorhandene Dateien ersetzen.

PRÜFUNG

- JavaScript-Syntaxprüfung: bestanden
- Mobile Browserprüfung ohne Startfehler: bestanden
- Schaltflächenfarben auf iPhone-Breite: bestanden
- Google-Drive-Aufruf im Baustellenabschluss: bestanden
- ZIP-Integritätsprüfung: bestanden

Nach dem Deployment kann Google Drive unter
Mehr > Einstellungen > Schnittstellen > Verbindungen testen
als eigener grüner Status geprüft werden.
