---
title: Framework-bewusste Lint- und Typprüfungs-Voreinstellungen
plugin: rules
audience: Agent der Lint/Type-Regeln anwenden muss
order: 1
lang: de
---

# Framework-bewusste Lint- und Typprüfungs-Voreinstellungen

Das Plugin `rules` beantwortet eine Frage: „Welche Lint- und
Typprüfungsregeln soll ich auf dieses Projekt, diese Datei, diesen
Ordner anwenden?" Die Antwort wird aus dem **Framework**, das das Projekt
verwendet, und aus **welchem Projektbereich** eine Datei sich befindet,
abgeleitet. Die eigene Konfiguration des Projekts hat immer Priorität.

## 0. Das mentale Modell

Ein **Projektbereich** ist ein Top-Level-Verzeichnis mit eigenem
`package.json` (oder Äquivalent). Jeder Bereich erhält ein Framework,
das aus seinem `package.json` / `requirements.txt` / `Cargo.toml` /
`pubspec.yaml` / `go.mod` erkannt wird — das Plugin liefert eine kleine
Bibliothek von „Ich sehe X, Standard ist Y"-Mappings.

Eine **Voreinstellung** ist ein Bundle aus (Lint-Regeln,
Typprüfungskonfig) für ein gegebenes Framework. Das Plugin hat
Voreinstellungen für `ts-eslint`, `ts-prettier`, `py-ruff`, `rs-clippy`,
`go-vet`, `kt-detekt`, … (nur die, die Tools entsprechen, die der Host
installiert hat).

Das Plugin kann in drei Modi betrieben werden (mit `--rules-mode=`):

| Modus | Verhalten |
|---|---|
| `strict` | Scheitert, wenn das Projekt keine Regeln-Konfig hat und keine Voreinstellung es abdeckt. |
| `mixed` (Standard) | Voreinstellung anwenden, wenn das Projekt keine Konfig hat; niemals scheitern. |
| `advisory` | Nichts schreiben; nur berichten, was *angewendet würde*. |

## 1. Eine Voreinstellung auf einen Projektbereich anwenden

```json
{
  "tool": "rules_apply",
  "args": {
    "area": "apps/web",
    "framework": "ts-react"
  }
}
```

Die Antwort ist eine Liste geschriebener Dateien + eine Zusammenfassung:

```json
{
  "ok": true,
  "written": [
    "apps/web/.eslintrc.json",
    "apps/web/tsconfig.strict.json"
  ],
  "preset": "ts-eslint+ts-prettier",
  "warnings": []
}
```

Hat das Projekt bereits eine `.eslintrc.json`, lässt das Plugin sie in
Ruhe und meldet `preset: "user-override"`. Die eigene Konfig des
Projekts **hat immer Priorität** — das ist der Vertrag.

## 2. Verfügbare Voreinstellungen auflisten

```json
{ "tool": "rules_get_presets", "args": { "framework": "ts-react" } }
```

Gibt den Voreinstellungsnamen, die Dateien die es schreiben würde, und
einen Link zur Upstream-Konfig zurück, von der es erbt. Die Liste ist,
was der Host in `node_modules` installiert hat — kein Netzwerk-Fetch.

## 3. Prüfen was angewendet würde (Trockenlauf)

```json
{
  "tool": "rules_apply",
  "args": {
    "area": "apps/web",
    "framework": "ts-react",
    "dryRun": true
  }
}
```

Gleiche Antwortform, aber das `written`-Array spiegelt wider, was
**geschrieben würde** — nichts wird geschrieben. Im Advisory-Modus
verwenden oder um dem Benutzer einen Diff vor dem Commit zu zeigen.

## 4. Ein Projekt auf seine Bereiche abbilden (CI-freundlich)

`rules_resolve_map` ist das Nur-Lesen-Tool, das die erkannte Zuordnung
Projektbereich → Framework → Voreinstellung zurückgibt. Das Plugin
cached dies in `.cache/mcp-vertex/rules/rules-map.json`, damit ein
CI-Lauf nicht bei jeder Ausführung neu erkannt.

```json
{ "tool": "rules_resolve_map", "args": {} }
```

## Häufige Fehler

- **Zwei `package.json` im selben Bereich** (Workspace + verschachteltes):
  Das Plugin nimmt das dem File am nächsten liegendste. Bei falscher
  Erkennung `area` explizit übergeben.
- **Eigenes Framework**: `framework: "<ihr-name>"` übergeben und das
  Plugin wendet keine Voreinstellung an (kein Match im Registre). Das
  Tool antwortet mit `preset: "no-preset"` und einer Warnung.
- **Tool lokal nicht installiert**: Eine Voreinstellung anwenden, die
  `ruff` auf einer Maschine ohne `ruff` benötigt, wird erfolgreich sein
  (das Plugin schreibt nur Konfig), aber das nachgelagerte
  `quality_run_quality` wird mit `code: 127` scheitern. Zuerst
  `rules_check` ausführen um die gesamte Kette zu trockenlaufen.

## Nächster Schritt

- [Wie die Plugins `rules` und `quality` zusammenarbeiten](#)
- [Eine Voreinstellung anpassen ohne sie zu forken (die User-Override-Regel)](#)
