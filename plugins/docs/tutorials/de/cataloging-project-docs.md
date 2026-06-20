---
title: Projektdokumentationen katalogisieren
plugin: docs
audience: jeder Agent, der ein Dokument nach Thema finden muss
order: 1
lang: de
---

# Projektdokumentationen katalogisieren

Das Plugin `docs` beantwortet eine kleine, häufige Frage: „Welche Docs
hat dieses Projekt, und welches suche ich?" Statt zu greppen, fragt
der Agent das Plugin. Dieses Tutorial zeigt, wie man aktiviert, auflistet
und liest.

## 0. Das mentale Modell

Ein **Doc** ist jede `.md`-Datei unter den konfigurierten `roots`. Das
Plugin zählt sie einmal auf, extrahiert den Titel (aus dem ersten
`# heading` oder frontmatter `title:`), und liefert einen token-armen
Index. Der Body wird nur auf Anfrage abgerufen.

Die Konfiguration liegt in `mcp-vertex.config.json`:

```jsonc
{
  "plugins": {
    "docs": {
      "options": {
        "roots": ["docs", "README.md", "CHANGELOG.md", "AGENTS.md"]
      }
    }
  }
}
```

`roots` ist ein Array von Pfaden (Dateien oder Verzeichnisse). Verzeichnisse
werden rekursiv durchsucht. **Pfade außerhalb des Workspaces werden
abgelehnt** — keine `..`-Traversierung.

## 1. Auflisten (token-armer Index)

```json
{ "tool": "docs_list", "args": {} }
```

Antwort (gekürzt):

```json
{
  "count": 18,
  "truncated": false,
  "docs": [
    { "path": "README.md", "title": "@mcp-vertex/core" },
    { "path": "docs/ARCHITECTURE.md", "title": "Architecture" },
    { "path": "docs/proposals/p100-…md", "title": "p100 — Web: echtes i18n…" },
    { "path": "CHANGELOG.md", "title": "Changelog" }
  ]
}
```

Die Liste ist nach Pfad sortiert. Übergeben Sie `roots`, um die Liste
auf eine Teilmenge zu beschränken (z.B. nur `["docs/proposals"]`):

```json
{
  "tool": "docs_list",
  "args": { "roots": ["docs/proposals"] }
}
```

## 2. Ein Doc lesen

```json
{
  "tool": "docs_read",
  "args": { "path": "docs/ARCHITECTURE.md" }
}
```

Antwort:

```json
{
  "path": "docs/ARCHITECTURE.md",
  "title": "Architecture",
  "content": "# Architecture\n\n…vollständiger Body…",
  "truncated": false,
  "found": true
}
```

`content` ist auf 256 KiB begrenzt. Bei größeren Docs ist `truncated:
true` und der Body sind die ersten 256 KiB. Wenn der Pfad keinem Doc
unter den konfigurierten Roots entspricht, `found: false`.

## 3. Warum zwei Tools und nicht eines

`list` ist günstig (wenige Hundert Byte pro Doc, 18 Docs ≈ 4 KiB).
`read` ist teuer (potenziell Megabytes pro Doc). Die Trennung ermöglicht
es dem Agenten, zuerst zu `list`-en und dann nur die relevanten zu
`read`-en — Token bei jedem Discovery-Schritt sparend.

## 4. Pfadeinschränkung (Sicherheit)

`docs_read` löst den Pfad mit `resolveWorkspaceContained` auf —
absolute Pfade, `..`-Traversierung und Symlinks, die außerhalb des
Workspaces zeigen, werden alle abgelehnt. Die `found: false`-Antwort
ist das Signal des Agenten, dass der Pfad abgelehnt wurde; das Plugin
unterscheidet absichtlich nicht zwischen „fehlt" und „außerhalb des
Workspaces" (um das Dateisystem-Layout nicht preiszugeben).

## Häufige Fehler

- **Root existiert nicht**: `docs_list` gibt `{ count: 0,
  truncated: false, docs: [] }` zurück. Das Plugin warnt nicht.
- **Doc noch nicht committed**: ungetrackte Dateien werden trotzdem
  geliefert (das Plugin liest vom Dateisystem, nicht von git). Der
  zurückgegebene `path` ist workspace-relativ.
- **Titelableitung schlägt fehl**: wenn das erste Heading nicht `# `
  ist (kein Leerzeichen, falsche Ebene) und kein frontmatter `title:`
  vorhanden ist, verwendet das Plugin den Dateinamen-Basename (z.B.
  `CHANGELOG.md` → `CHANGELOG.md`). Nach der Korrektur des Headings
  neu ausführen.

## Nächster Schritt

- [Wie `docs_list` mit `memory_recall` für „was habe ich gespeichert + wo war es dokumentiert?" integriert](#)
- [Einen Wissensindex mit dem `knowledge`-Plugin kuratieren](#)
