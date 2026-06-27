---
title: Installa ed esegui
description: Installa mcp-vertex, collegalo al tuo IDE, scegli un preset e verifica il server prima di iniziare a lavorare.
order: 1
navLabel: Installa
---

# Installa ed esegui

Aggiungi mcp-vertex al tuo flusso di lavoro, punta il client MCP al binario e verifica il set di plugin risolto prima della prima sessione.

## Scegli il tuo gestore di pacchetti

Tutti i gestori di pacchetti qui sotto eseguono lo stesso pacchetto pubblicato. Scegli quello che il tuo team usa già e mantieni i comandi esattamente come sono.

### npm

Node Package Manager arriva insieme a Node.js, quindi è la scelta universale più sicura quando ti serve la compatibilità più ampia tra macchine e runner di CI.

```bash
npx -y @mcp-vertex/core init
npx -y @mcp-vertex/core --check
```

### pnpm

pnpm è veloce, efficiente sul disco e rigoroso nella risoluzione delle dipendenze, quindi è un'ottima scelta per monorepo o team che hanno già standardizzato pnpm.

```bash
pnpm dlx @mcp-vertex/core init
pnpm dlx @mcp-vertex/core --check
```

### yarn

Yarn resta un'alternativa familiare in molti progetti JavaScript, quindi questo percorso funziona bene quando strumenti e abitudini del team ruotano già attorno a Yarn.

```bash
yarn dlx @mcp-vertex/core init
yarn dlx @mcp-vertex/core --check
```

### bun

bun unisce runtime e gestore di pacchetti in un solo strumento, e mcp-vertex stesso è costruito con bun, quindi questo è il percorso più diretto quando bun è già disponibile sulla macchina.

```bash
bunx @mcp-vertex/core init
bunx @mcp-vertex/core --check
```

### deno

Deno può eseguire direttamente il pacchetto npm, cosa utile se preferisci un runtime sicuro di default con supporto TypeScript di prima classe e compatibilità npm.

```bash
deno run -A npm:@mcp-vertex/core init
deno run -A npm:@mcp-vertex/core --check
```

## Scegli il tuo IDE

Gli snippet qui sotto usano il preset standard via bun. Incolla il JSON così com'è nel file di destinazione e lascia che il tuo IDE registri il server stdio.

### VS Code

File: .vscode/mcp.json
Ambito: progetto

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

File: .cursor/mcp.json o ~/.cursor/mcp.json
Ambito: progetto / globale

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

File: ~/.codeium/windsurf/mcp_config.json
Ambito: globale

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

File: .mcp.json o tramite claude mcp add
Ambito: progetto

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

File: claude_desktop_config.json
Ambito: globale

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

File: ~/.gemini/antigravity-ide/mcp_config.json
Ambito: globale

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

File: settings.json
Ambito: globale

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

## Scegli un preset

I preset sono additivi. Parti dal set più piccolo ed espandi la superficie dei plugin solo quando il tuo flusso di lavoro ne ha davvero bisogno.

### minimal

Uso consigliato: orientamento in sola lettura e smoke test di CI.
Dimensione: 2 plugin.

- git
- search

### standard

Uso consigliato: lavoro single-agent con memoria, docs, aiuto per lint, tipi e dipendenze.
Dimensione: 7 plugin.

- git
- search
- memory
- docs
- rules
- quality
- deps

### swarm

Uso consigliato: coordinamento multi-agente con lock, notifiche, log e marker di chiusura. Audit resta opt-in e va caricato separatamente quando il round finisce.
Dimensione: 13 plugin.

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

Uso consigliato: il preset swarm più integrazioni host-only come web-fetch e issues, quando l'host le espone.
Dimensione: 15 plugin.

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

## Verifica

Quando la configurazione è pronta, esegui un self-check con lo stesso gestore di pacchetti usato per l'installazione. Sostituisci `bunx` con `npx`, `pnpm dlx`, `yarn dlx` o `deno run -A npm:` se quello è il tuo percorso scelto.

```bash
bunx @mcp-vertex/core --check
bunx @mcp-vertex/core --preset=swarm --exclude-plugins=notification --check
```

Usa `--exclude-plugins=` quando vuoi sottrarre un plugin da un preset senza fare fork del preset, ad esempio per mantenere la base swarm ma rimuovere notification in una sessione single-agent.

## FAQ

### Perché `deno run -A npm:@mcp-vertex/core` parte lentamente?

Deno risolve e verifica il pacchetto npm al primo utilizzo. Le esecuzioni successive riusano la cache in `~/.cache/deno`, ma per avvii locali ripetuti bun o npx restano più veloci.

### Il mio IDE non è in elenco. E adesso?

Qualsiasi IDE che accetti un server MCP via stdio può eseguire lo stesso server. Parti dal JSON di VS Code, cambia il percorso del file con quello previsto dal tuo IDE e mantieni lo stesso comando con gli stessi argomenti.

### Posso eseguire più preset insieme?

No. Una singola istanza del server risolve un solo preset alla volta. Se progetti diversi hanno bisogno di set di plugin differenti, metti un mcp-vertex.config.json dedicato in ogni progetto e lascia che il loader lo risolva per workspace.