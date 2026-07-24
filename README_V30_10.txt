mainabdichter PRO V30.10

- Besichtigungsfotos werden kunden-, vorgangs- und bereichsbezogen in Google Drive gespeichert.
- Zielstruktur: mainabdichter PRO/Kunden/Nachname, Vorname/Besichtigungsnummer/Fotos/Bereich.
- Bilder bleiben in der Besichtigungsakte sichtbar und werden nicht mehr dauerhaft als große Bilddaten im Browser gespeichert.
- Eine IndexedDB-Warteschlange hält Fotos bei fehlendem Empfang lokal vor.
- Offene Uploads werden bei wiederhergestellter Verbindung automatisch erneut versucht.
- Erforderliche Worker-Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET und GOOGLE_REFRESH_TOKEN.
