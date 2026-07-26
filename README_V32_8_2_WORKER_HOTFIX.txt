mainabdichter PRO – V32.8.2 Worker-Hotfix

Dieses Paket enthält den vollständigen bereinigten Projektstand V32.8.1
und zusätzlich den korrigierten Cloudflare Worker:

  cloudflare-worker.js

Behobener Fehler:
  HTTP 500 – "idFromValue is not defined" beim Erstellen einer Baustelle.

Wichtig:
  Für die Fehlerbehebung muss der Inhalt von cloudflare-worker.js im
  bestehenden Cloudflare Worker vollständig eingesetzt und dort deployed
  werden. Ein Upload des Pakets zu GitHub allein veröffentlicht den Worker
  nicht automatisch.

Die übrigen App-Dateien entsprechen dem bereits funktionierenden Stand.
