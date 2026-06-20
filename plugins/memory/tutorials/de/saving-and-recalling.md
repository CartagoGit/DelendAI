---
title: Speichern und Abrufen von Memory-Notizen
plugin: memory
audience: jeder Agent, der sitzungsübergreifende Kontinuität benötigt
order: 1
lang: de
---

# Speichern und Abrufen von Memory-Notizen

Dieses Tutorial zeigt die vier `memory_*`-Tools in Aktion. Notizen
sind kleine JSON-Einträge unter `.cache/mcp-vertex/memory/notes.json`
— klein genug für eine vollständige Ausgabe, indiziert nach id,
abrufbar per Tag oder Volltextsuche.

## 0. Das mentale Modell

Eine **Notiz** ist `{ id, title, body, tags, createdAt, updatedAt }`.
Titel sind eindeutig (Groß-/Kleinschreibung ignoriert) — `memory_save`
führt einen Upsert nach Titel durch. Es gibt kein Schema für `body`;
behandeln Sie es als kurzes Freitextfeld. Secrets werden von
`redactSecrets` automatisch entfernt, bevor die Notiz gespeichert wird
(siehe `packages/core/src/lib/shared/redact.ts`).

## 1. Eine Notiz speichern

```json
{
  "tool": "memory_save",
  "args": {
    "title": "Monorepo-Publikationsreihenfolge",
    "body": "Core zuerst, dann Plugins im Gleichlauf. derive-version.ts liest Conventional Commits seit dem letzten vX.Y.Z-Tag.",
    "tags": ["release", "monorepo"]
  }
}
```

Antwort: `{ id: "<uuid>", createdAt: "..." }`. Save gibt die id zurück,
damit Sie sie später vergessen können.

## 2. Nach Abfrage abrufen

```json
{
  "tool": "memory_recall",
  "args": {
    "query": "Publikationsreihenfolge",
    "limit": 5
  }
}
```

Gibt bis zu `limit` Notizen zurück, die der Abfrage entsprechen
(Teilstring-Match auf Titel + Body, nach Aktualität geordnet). Verwenden
Sie `tags` anstatt (oder zusätzlich zu) `query`, um einzugrenzen:

```json
{
  "tool": "memory_recall",
  "args": { "tags": ["release"], "limit": 10 }
}
```

## 3. Kostengünstig auflisten

`memory_list` gibt nur `{ id, title, tags }` zurück — den Index.
Verwenden Sie es, wenn Sie die Bodies noch nicht abrufen möchten:

```json
{ "tool": "memory_list", "args": { "limit": 50 } }
```

## 4. Vergessen

```json
{ "tool": "memory_forget", "args": { "id": "<uuid>" } }
```

`memory_forget` ist ein Hard-Delete — es gibt kein Soft-Delete / Archiv.
Die id ist weg; der Titel ist für ein zukünftiges `memory_save` frei.

## Häufige Fehler

- **Secrets in `body`**: Auch wenn das Plugin beim Speichern bereinigt,
  fügen Sie keine rohen Token oder `.env`-Werte ein — die Bereinigung
  ist heuristisch, nicht perfekt.
- **Titelkollisionen**: `memory_save` führt einen Upsert nach Titel durch.
  Wenn zwei Agenten denselben Titel parallel speichern, gewinnt der zweite
  Schreiber und der erste geht verloren. Verwenden Sie eindeutige Titel
  pro Slice / pro Problem.
- **Recall gibt zu viele Treffer**: Bevorzugen Sie `tags` gegenüber einer
  breiten `query`. Eine query von `""` gibt alles nach Aktualität sortiert
  zurück — nützlich für „Was habe ich letztes Mal gespeichert?" aber
  teuer bei einem vollen Store.

## Nächster Schritt

- [Wie round_context (proposals) Speichernotizen mit aktiven Vorschlägen verknüpft](../../proposals/tutorials/de/getting-started.md)
- [Secrets-Redaction-Vertrag](https://github.com/CartagoGit/mcp-vertex/blob/main/packages/core/src/lib/shared/redact.ts)
