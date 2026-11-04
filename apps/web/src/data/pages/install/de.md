---
title: Installieren und starten
description: Installiere delendai, binde es in dein IDE ein, wähle ein Preset und prüfe den Server vor dem ersten Einsatz.
order: 1
navLabel: Installieren
---

# Installieren und starten

Füge delendai zu deinem Workflow hinzu, richte deinen MCP-Client auf das Binary aus und prüfe das aufgelöste Plugin-Set vor der ersten Sitzung.

## Wähle deinen Paketmanager

Alle Paketmanager unten starten dasselbe veröffentlichte Paket. Nimm den, den dein Team bereits verwendet, und übernimm die Befehle unverändert.

### npm

Node Package Manager wird mit Node.js ausgeliefert und ist deshalb die sicherste universelle Standardwahl, wenn du möglichst breite Kompatibilität über Rechner und CI-Runner hinweg brauchst.

```bash
npx -y @delendai/cli init
npx -y @delendai/cli validate
```

### pnpm

pnpm ist schnell, spart Speicherplatz und ist strikt bei der Abhängigkeitsauflösung. Das passt besonders gut zu Monorepos oder Teams, die pnpm bereits standardisiert haben.

```bash
pnpm dlx @delendai/cli init
pnpm dlx @delendai/cli validate
```

### yarn

Yarn ist in vielen JavaScript-Codebasen weiterhin eine vertraute Alternative. Dieser Weg passt daher gut, wenn Tooling und Gewohnheiten deines Teams bereits um Yarn herum gebaut sind.

```bash
yarn dlx @delendai/cli init
yarn dlx @delendai/cli validate
```

### bun

bun bündelt Runtime und Paketmanager in einem Werkzeug, und delendai selbst wird mit bun gebaut. Deshalb ist das der direkteste Weg, wenn bun auf dem Rechner bereits verfügbar ist.

```bash
bunx @delendai/cli init
bunx @delendai/cli validate
```

### deno

Deno kann das npm-Paket direkt ausführen. Das ist hilfreich, wenn du eine standardmäßig sichere Runtime mit erstklassigem TypeScript-Support und npm-Kompatibilität bevorzugst.

```bash
deno run -A npm:@delendai/cli init
deno run -A npm:@delendai/cli validate
```

## Wähle dein IDE

Die Snippets unten verwenden das Standard-Preset über bun. Füge das JSON unverändert in die Zieldatei ein und lass dein IDE anschließend den stdio-Server registrieren.

### VS Code

Datei: .vscode/mcp.json
Geltungsbereich: Projekt

```json
{
  "servers": {
    "delendai": {
      "type": "stdio",
      "command": "bunx",
      "args": [
        "--package",
        "@delendai/cli",
        "delendai",
        "__serve",
        "--workspace",
        ".",
        "--preset",
        "solo"
      ]
    }
  }
}
```

### Cursor

Datei: .cursor/mcp.json oder ~/.cursor/mcp.json
Geltungsbereich: Projekt / global

```json
{
  "mcpServers": {
    "delendai": {
      "command": "bunx",
      "args": [
        "--package",
        "@delendai/cli",
        "delendai",
        "__serve",
        "--workspace",
        ".",
        "--preset",
        "solo"
      ]
    }
  }
}
```

### Windsurf

Datei: ~/.codeium/windsurf/mcp_config.json
Geltungsbereich: global

```json
{
  "mcpServers": {
    "delendai": {
      "command": "bunx",
      "args": [
        "--package",
        "@delendai/cli",
        "delendai",
        "__serve",
        "--workspace",
        ".",
        "--preset",
        "solo"
      ]
    }
  }
}
```

### Claude Code

Datei: .mcp.json oder über claude mcp add
Geltungsbereich: Projekt

```json
{
  "mcpServers": {
    "delendai": {
      "command": "bunx",
      "args": [
        "--package",
        "@delendai/cli",
        "delendai",
        "__serve",
        "--workspace",
        ".",
        "--preset",
        "solo"
      ]
    }
  }
}
```

### Claude Desktop

Datei: claude_desktop_config.json
Geltungsbereich: global

```json
{
  "mcpServers": {
    "delendai": {
      "command": "bunx",
      "args": [
        "--package",
        "@delendai/cli",
        "delendai",
        "__serve",
        "--workspace",
        ".",
        "--preset",
        "solo"
      ]
    }
  }
}
```

### Antigravity

Datei: ~/.gemini/antigravity-ide/mcp_config.json
Geltungsbereich: global

```json
{
  "mcpServers": {
    "delendai": {
      "command": "bunx",
      "args": [
        "--package",
        "@delendai/cli",
        "delendai",
        "__serve",
        "--workspace",
        ".",
        "--preset",
        "solo"
      ]
    }
  }
}
```

### Zed

Datei: settings.json
Geltungsbereich: global

```json
{
  "context_servers": {
    "delendai": {
      "command": "bunx",
      "args": [
        "--package",
        "@delendai/cli",
        "delendai",
        "__serve",
        "--workspace",
        ".",
        "--preset",
        "solo"
      ]
    }
  }
}
```

## Wähle ein Preset

Presets sind additiv. Starte mit dem kleinsten Satz und erweitere die Plugin-Oberfläche nur dann, wenn dein Workflow sie wirklich braucht.

### minimal

Empfohlener Einsatz: Read-only-Orientierung und CI-Smoke-Tests.
Größe: 2 Plugins · 42 Tools · ~11805 Tokens beim Kaltstart

- git
- search

### solo

Empfohlener Einsatz: eine Entwicklerin oder ein Entwickler mit einem Agenten im Alltag; der Standard von `init`.
Größe: 10 Plugins · 79 Tools · ~19037 Tokens beim Kaltstart

- git
- search
- memory
- docs
- quality
- rules
- deps
- test-policy
- env
- refactor

### team-pr

Empfohlener Einsatz: ein Team, das über Pull Requests arbeitet, mit Commit- und Testkonventionen.
Größe: 18 Plugins · 116 Tools · ~25446 Tokens beim Kaltstart

- git
- search
- memory
- docs
- quality
- rules
- deps
- test-policy
- env
- refactor
- forge
- commit-policy
- conventions
- test-convention
- security
- web-fetch
- status-marker
- error-reporting

### swarm

Empfohlener Einsatz: mehrere Agenten mit gemeinsamem Checkout, mit Vorschlägen, Logs und Abschlussmarkern.
Größe: 19 Plugins · 125 Tools · ~26802 Tokens beim Kaltstart

- git
- search
- memory
- docs
- quality
- test-policy
- proposals
- error-reporting
- logs
- agent-orchestrator
- auto-agent-selector
- notification
- completion
- status-marker
- forge
- commit-policy
- conventions
- test-convention
- usage-tracking

### audit

Empfohlener Einsatz: schreibgeschützte Reviews und Audits.
Größe: 15 Plugins · 89 Tools · ~21955 Tokens beim Kaltstart

- git
- search
- docs
- audit
- security
- web-fetch
- deps
- tech-debt
- link-check
- project-health
- impact-analysis
- refactor
- quality
- test-policy
- logs

### docs-web

Empfohlener Einsatz: Dokumentation und Websites.
Größe: 8 Plugins · 61 Tools · ~15696 Tokens beim Kaltstart

- git
- search
- memory
- docs
- i18n
- link-check
- web-fetch
- env

### everything

Empfohlener Einsatz: Diagnose mit jedem veröffentlichten Plugin, auch denen mit Netzwerk- oder Zugangsdatenzugriff.
Größe: 58 Plugins · 236 Tools · ~59122 Tokens beim Kaltstart

- adaptive-optimizer
- agent-orchestrator
- api
- audit
- audit-orchestrator
- auto-agent-selector
- auto-plugin-selector
- browser
- cache
- commit-policy
- completion
- container
- context-for-change
- conventions
- database
- deps
- diagram
- docs
- env
- error-reporting
- execution-env
- external-mcps
- forge
- framework-knowledge
- git
- github
- gitlab
- i18n
- impact-analysis
- issues
- link-check
- logs
- memory
- notification
- observability
- orchestrator-runner
- perf
- project-health
- project-kpis
- prompt-eval
- prompts-pack
- proposals
- quality
- quality-policy
- refactor
- remote-provider-core
- rules
- search
- security
- self-learning
- skills-pack
- status-marker
- style-convention
- tech-debt
- test-convention
- test-policy
- usage-tracking
- web-fetch

## Prüfen

Sobald die Konfiguration liegt, führe einen Self-Check mit demselben Paketmanager aus, den du für die Installation verwendet hast. Ersetze `bunx` durch `npx`, `pnpm dlx`, `yarn dlx` oder `deno run -A npm:`, wenn das dein gewählter Weg ist.

```bash
bunx @delendai/cli validate
bunx @delendai/cli --preset=swarm --exclude-plugins=notification validate
```

Nutze `--exclude-plugins=`, wenn du ein Plugin aus einem Preset abziehen willst, ohne das Preset zu forken, zum Beispiel um die Swarm-Basis zu behalten, aber notification in einer Single-Agent-Sitzung zu entfernen.

## FAQ

### Warum startet `deno run -A npm:@delendai/cli` langsam?

Deno löst das npm-Paket beim ersten Aufruf auf und verifiziert es. Spätere Starts nutzen den Cache in `~/.cache/deno`, aber für wiederholte lokale Aufrufe starten bun oder npx weiterhin schneller.

### Mein IDE ist nicht gelistet. Was jetzt?

Jedes IDE, das einen stdio-MCP-Server akzeptiert, kann denselben Server ausführen. Nimm das VS-Code-JSON als Ausgangspunkt, ändere den Dateipfad auf den von deinem IDE erwarteten Wert und behalte denselben Befehl mit denselben Argumenten.

### Kann ich mehrere Presets gleichzeitig ausführen?

Nein. Eine Serverinstanz löst immer genau ein Preset gleichzeitig auf. Wenn verschiedene Projekte unterschiedliche Plugin-Sets brauchen, lege in jedem Projekt eine eigene delendai.config.json ab und lass den Loader pro Workspace auflösen.