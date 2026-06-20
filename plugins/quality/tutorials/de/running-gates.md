---
title: Quality-Gates für jede Sprache ausführen
plugin: quality
audience: Agent der den Projektstatus validieren muss
order: 1
lang: de
---

# Quality-Gates für jede Sprache ausführen

Das Plugin `quality` ist **sprachagnostisch** konzipiert: Es startet
die Befehle, die Ihre `mcp-vertex.config.json` vorgibt, und meldet
den Exit-Code. Dieses Tutorial zeigt die drei Quellen für Scopes (in
Prioritätsreihenfolge), wie man einen ausführt, und wie man einen
außer Kontrolle geratenen Prozess abbricht.

## 0. Das mentale Modell

Ein **Scope** ist eine benannte Liste von Befehlen. Das Plugin führt
jeden Befehl im Scope der Reihe nach aus, erfasst stdout/stderr und
gibt einen strukturierten `{ ok, results: [{ command, ok, code, tail }] }`
Bericht zurück. Das `ok`-Feld betrifft den gesamten Scope — wenn ein
Befehl fehlschlägt, ist der Scope nicht ok.

```
┌─ plugin options.scopes (höchste Priorität)
├─ mcp-vertex.config.json → validationMatrix.scopes
└─ erkannte package.json-Skripte → "all" (lint, typecheck, test, build)
```

## 1. Verfügbare Scopes auflisten (nur lesen)

```json
{ "tool": "quality_get_quality_scopes", "args": {} }
```

Beispielantwort (gekürzt):

```json
{
  "scopes": {
    "all": [
      { "command": "bun run lint", "expect": "exit0" },
      { "command": "bun run typecheck", "expect": "exit0" },
      { "command": "bun run test", "expect": "exit0" }
    ]
  }
}
```

## 2. Einen Scope ausführen

```json
{ "tool": "quality_run_quality", "args": { "scope": "all" } }
```

Die Antwort ist pro Befehl:

```json
{
  "scope": "all",
  "ok": false,
  "results": [
    {
      "command": "bun run lint",
      "ok": true,
      "code": 0,
      "tail": "Checked 400 files in 159ms. No fixes applied."
    },
    {
      "command": "bun run test",
      "ok": false,
      "code": 1,
      "tail": "FAIL tests/src/foo.spec.ts …"
    }
  ]
}
```

Lesen Sie `results[N].tail` für den Fehlerkontext. Der `tail` sind die
letzten 20 nicht-leeren Zeilen (begrenzt auf 64 KiB Gesamtausgabe) —
genug zum Debuggen ohne den Agenten-Kontext zu überfluten.

## 3. Einen außer Kontrolle geratenen Prozess abbrechen

```json
{ "tool": "quality_quality_cancel", "args": {} }
```

Sendet `SIGKILL` an die Prozessgruppe jedes laufenden Runs. Übergeben
Sie `{ "pid": <number> }`, um einen abzubrechen. Der Abbruch ist
nicht-blockierend: das `results` des nächsten Aufrufs spiegelt den
Kill wider.

## 4. Sprachagnostisch machen

Der Core führt aus, was Ihre Konfiguration sagt. Beispiel für ein
polyglottest Projekt (TypeScript + Python):

```jsonc
// mcp-vertex.config.json
{
  "plugins": { "quality": { "options": {} } },
  "validationMatrix": {
    "scopes": {
      "typecheck": [
        { "command": "tsc --noEmit", "expect": "exit0" },
        { "command": "mypy .",      "expect": "exit0" }
      ],
      "test": [
        { "command": "vitest run", "expect": "exit0" },
        { "command": "pytest -q",  "expect": "exit0" }
      ]
    }
  }
}
```

`run_quality` wird **alle vier Befehle** in den Scopes `typecheck` /
`test` ausführen, unabhängig von der Sprache. Exit 0 = bestanden;
nicht-null = fehlgeschlagen (unabhängig davon, welches Binary es
ausgegeben hat).

## 5. Mit einer Befehlsrichtlinie absichern (M13)

`run_quality` **führt aus**, was die Host-Konfiguration vorgibt. Um zu
beschränken, welche Binaries ausgeführt werden dürfen, wenn ein weniger
vertrauenswürdiger Agent das Tool aufruft, verwenden Sie
`commandPolicy`:

```jsonc
{
  "plugins": {
    "quality": {
      "options": {
        "commandPolicy": {
          "allow": ["bun", "npm", "npx", "tsc", "vitest", "biome", "mypy", "ruff", "pytest"],
          "deny":  ["curl", "wget", "bash", "sh"]
        }
      }
    }
  }
}
```

Ein blockierter Befehl wird mit `code: 126` und einem Grund
(„blocked by command policy") gemeldet und wird **niemals gestartet**.
`deny` überstimmt `allow`; ein leeres `allow` bedeutet „jedes nicht
verbotene Binary".

## Häufige Fehler

- **`run_quality` ersetzt nicht `bun run validate`**: das `validate`-Skript
  des Cores führt die vier Checks direkt aus. `run_quality` ist für
  **Ad-hoc**-Ausführungen und Scope-Introspektion von einem Agenten.
  Beide sind gültig und kommunizieren nicht miteinander.
- **Ein lange laufender Befehl, der das Timeout überschreitet**, wird
  mit `code: 124` und `timedOut: true` beendet. Standard-Timeout ist
  600 000 ms (10 Minuten). Bei Bedarf pro Runner überschreiben.
- **Pollen ob „fertig?"**: nicht tun. `run_quality` ist synchron. Wenn
  Sie über lange Scopes Bescheid wissen müssen, verwenden Sie
  `quality_cancel` mit dem `pid` aus `activeRunPids` (via Metriken oder
  ein nachfolgendes Tool-Call).

## Nächster Schritt

- [Mehrsprachige Quality-Gates (p107)](../../p107-multilang-quality-gates.md)
- [Vertrauensgrenze & Befehlsrichtlinie (M13)](../../p107-multilang-quality-gates.md#5-no-objetivos)
