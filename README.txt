mainabdichter V22 – komplettes Redesign

NEU
- neues hochgeladenes mainabdichter-Logo in App und PDFs
- Dashboard ohne Besichtigungsnummer, Ort, Wetter oder andere auftragsspezifische Daten
- ruhiges Dashboard mit Terminen, Baustellen, offenen Angeboten und Nachkontrollen
- auftragsspezifische Metadaten nur noch im geöffneten Vorgang
- kompakter Vorgangskopf mit Kunde, Objekt, Anrufen und Navigation
- reduzierte Navigation mit Übersicht, Kunden, Vorgänge, Baustellen und Mehr
- vereinheitlichte weiße Karten, Anthrazit und Marken-Grün
- responsive Darstellung für iPhone, iPad und Desktop
- bisherige Funktionen und IDs wurden beibehalten

INSTALLATION
Den kompletten ZIP-Inhalt in GitHub hochladen und bestehende Dateien ersetzen.
Die cloudflare-worker.js ist aus V21.1 enthalten. Bei bereits installierter V21.1 muss der Worker nicht zwingend erneut ersetzt werden.


V22.1 – SICHERE BAUAKTEN-ZUORDNUNG
- Notizen, Aktivitäten und Dateien werden nochmals lokal auf die exakte Deal-ID gefiltert.
- Weitere Deals werden nur bei exakt identischer Person-ID angezeigt.
- Doppelte Context-Route im Worker entfernt.
- Lexware wird zuerst über die exakte E-Mail-Adresse zugeordnet.
- Eine reine Namenszuordnung wird nur akzeptiert, wenn genau ein exakter Treffer existiert.
- Fremde Kunden-, Deal- oder Aktivitätsdaten werden verworfen.


V22.2 HOTFIX
- beschädigtes, zusammengeklebtes Lexware-Codefragment aus cloudflare-worker.js entfernt
- vorhandene vollständige Lexware-Kundenhistorie bleibt erhalten
- Worker-Syntax vollständig geprüft
