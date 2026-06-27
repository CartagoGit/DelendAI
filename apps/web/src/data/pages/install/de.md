---
title: Installieren und starten
description: Installiere mcp-vertex, binde es in dein IDE ein, wähle ein Preset und prüfe den Server vor dem ersten Einsatz.
order: 1
navLabel: Installieren
---

# Installieren und starten

Füge mcp-vertex zu deinem Workflow hinzu, richte deinen MCP-Client auf das Binary aus und prüfe das aufgelöste Plugin-Set vor der ersten Sitzung.

## Wähle deinen Paketmanager

Alle Paketmanager unten starten dasselbe veröffentlichte Paket. Nimm den, den dein Team bereits verwendet, und übernimm die Befehle unverändert.

### npm

Node Package Manager wird mit Node.js ausgeliefert und ist deshalb die sicherste universelle Standardwahl, wenn du möglichst breite Kompatibilität über Rechner und CI-Runner hinweg brauchst.

```bash
npx -y @mcp-vertex/core init
npx -y @mcp-vertex/core --check
```

### pnpm

pnpm ist schnell, spart Speicherplatz und ist strikt bei der Abhängigkeitsauflösung. Das passt besonders gut zu Monorepos oder Teams, die pnpm bereits standardisiert haben.

```bash
pnpm dlx @mcp-vertex/core init
pnpm dlx @mcp-vertex/core --check
```

### yarn

Yarn ist in vielen JavaScript-Codebasen weiterhin eine vertraute Alternative. Dieser Weg passt daher gut, wenn Tooling und Gewohnheiten deines Teams bereits um Yarn herum gebaut sind.

```bash
yarn dlx @mcp-vertex/core init
yarn dlx @mcp-vertex/core --check
```

### bun

bun bündelt Runtime und Paketmanager in einem Werkzeug, und mcp-vertex selbst wird mit bun gebaut. Deshalb ist das der direkteste Weg, wenn bun auf dem Rechner bereits verfügbar ist.

```bash
bunx @mcp-vertex/core init
bunx @mcp-vertex/core --check
```

### deno

Deno kann das npm-Paket direkt ausführen. Das ist hilfreich, wenn du eine standardmäßig sichere Runtime mit erstklassigem TypeScript-Support und npm-Kompatibilität bevorzugst.

```bash
deno run -A npm:@mcp-vertex/core init
deno run -A npm:@mcp-vertex/core --check
```

## Wähle dein IDE

Die Snippets unten verwenden das Standard-Preset über bun. Füge das JSON unverändert in die Zieldatei ein und lass dein IDE anschließend den stdio-Server registrieren.

### VS Code

Datei: .vscode/mcp.json
Geltungsbereich: Projekt

```json
{
  "servers": {
    "mcp-vertex": {
      "type": "stdio",
      "command": "bunx",
      "args": [
        "@mcp-vertex/core",
        "--preset=standard"
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
    "mcp-vertex": {
      "command": "bunx",
      "args": [
        "@mcp-vertex/core",
        "--preset=standard"
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
    "mcp-vertex": {
      "command": "bunx",
      "args": [
        "@mcp-vertex/core",
        "--preset=standard"
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
    "mcp-vertex": {
      "command": "bunx",
      "args": [
        "@mcp-vertex/core",
        "--preset=standard"
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
    "mcp-vertex": {
      "command": "bunx",
      "args": [
        "@mcp-vertex/core",
        "--preset=standard"
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
    "mcp-vertex": {
      "command": "bunx",
      "args": [
        "@mcp-vertex/core",
        "--preset=standard"
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
    "mcp-vertex": {
      "command": "bunx",
      "args": [
        "@mcp-vertex/core",
        "--preset=standard"
      ]
    }
  }
}
```

## Wähle ein Preset

Presets sind additiv. Starte mit dem kleinsten Satz und erweitere die Plugin-Oberfläche nur dann, wenn dein Workflow sie wirklich braucht.

### minimal

Empfohlener Einsatz: Read-only-Orientierung und CI-Smoke-Tests.
Größe: 2 Plugins.

- git
- search

### standard

Empfohlener Einsatz: Single-Agent-Arbeit mit Memory, Docs, Lint-, Typ- und Dependency-Hilfe.
Größe: 7 Plugins.

- git
- search
- memory
- docs
- rules
- quality
- deps

### swarm

Empfohlener Einsatz: Multi-Agent-Koordination mit Locks, Benachrichtigungen, Logs und Close-Markern. Audit bleibt opt-in und sollte nach Abschluss einer Runde separat geladen werden.
Größe: 13 Plugins.

- git
- search
- memory
- docs
- rules
- quality
- deps
- proposals
- notification
- logs
- status-marker
- test-convention
- conventions

### full

Empfohlener Einsatz: das Swarm-Preset plus host-only Integrationen wie web-fetch und issues, wenn der Host sie bereitstellt.
Größe: 15 Plugins.

- git
- search
- memory
- docs
- rules
- quality
- deps
- proposals
- notification
- logs
- status-marker
- test-convention
- conventions
- web-fetch
- issues

## Prüfen

Sobald die Konfiguration liegt, führe einen Self-Check mit demselben Paketmanager aus, den du für die Installation verwendet hast. Ersetze `bunx` durch `npx`, `pnpm dlx`, `yarn dlx` oder `deno run -A npm:`, wenn das dein gewählter Weg ist.

```bash
bunx @mcp-vertex/core --check
bunx @mcp-vertex/core --preset=swarm --exclude-plugins=notification --check
```

Nutze `--exclude-plugins=`, wenn du ein Plugin aus einem Preset abziehen willst, ohne das Preset zu forken, zum Beispiel um die Swarm-Basis zu behalten, aber notification in einer Single-Agent-Sitzung zu entfernen.

## FAQ

### Warum startet `deno run -A npm:@mcp-vertex/core` langsam?

Deno löst das npm-Paket beim ersten Aufruf auf und verifiziert es. Spätere Starts nutzen den Cache in `~/.cache/deno`, aber für wiederholte lokale Aufrufe starten bun oder npx weiterhin schneller.

### Mein IDE ist nicht gelistet. Was jetzt?

Jedes IDE, das einen stdio-MCP-Server akzeptiert, kann denselben Server ausführen. Nimm das VS-Code-JSON als Ausgangspunkt, ändere den Dateipfad auf den von deinem IDE erwarteten Wert und behalte denselben Befehl mit denselben Argumenten.

### Kann ich mehrere Presets gleichzeitig ausführen?

Nein. Eine Serverinstanz löst immer genau ein Preset gleichzeitig auf. Wenn verschiedene Projekte unterschiedliche Plugin-Sets brauchen, lege in jedem Projekt eine eigene mcp-vertex.config.json ab und lass den Loader pro Workspace auflösen.