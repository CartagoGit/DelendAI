---
title: Konfigurationszentrum
description: Konfiguriere delendai-Plugins und prüfe Artefakt-Herkunft sicher in VS Code.
order: 2
navLabel: Konfiguration
---

# Konfigurationszentrum

Starte **DelendAI: Open Configuration Center** in VS Code und wähle bei mehreren Wurzeln das Projekt. Allgemeine Einstellungen, Plugins, Provider, Agenten, Skills, Prompts, Ressourcen und Wissen zeigen Besitzer und Herkunft.

## Sicheres Bearbeiten

Nur `delendai.config.json` wird geändert; Startbefehl, Argumente, Präfix, Theme und Sprache bleiben VS-Code-Einstellungen. Beim Speichern werden Datei-Hash, Pfad-Merge, Gesamtschema und atomarer Austausch verwendet. Unbekannte Felder und deaktivierte externe Server bleiben erhalten. Bei einem Konflikt neu laden und die Änderung erneut anwenden.

Geheimnisse bleiben verborgen; `env` enthält nur Variablennamen. Nach Änderungen den Server neu starten.

## Plugin-Autoren

Veröffentliche `optionsSchema` im selben `definePlugin(...)`, das `ctx.options` validiert, und halte `configExample.options` schema-gültig. Lokale Plugins über `plugins.<id>.path` und externe MCP-Kinder erscheinen automatisch mit Schema und Herkunft.
