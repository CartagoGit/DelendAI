---
title: Installa ed esegui
description: Installa delendai, collegalo al tuo IDE, scegli un preset e verifica il server prima di iniziare a lavorare.
order: 1
navLabel: Installa
---

# Installa ed esegui

Aggiungi delendai al tuo flusso di lavoro, punta il client MCP al binario e verifica il set di plugin risolto prima della prima sessione.

## Scegli il tuo gestore di pacchetti

Tutti i gestori di pacchetti qui sotto eseguono lo stesso pacchetto pubblicato. Scegli quello che il tuo team usa già e mantieni i comandi esattamente come sono.

### npm

Node Package Manager arriva insieme a Node.js, quindi è la scelta universale più sicura quando ti serve la compatibilità più ampia tra macchine e runner di CI.

```bash
npx -y @delendai/cli init
npx -y @delendai/cli validate
```

### pnpm

pnpm è veloce, efficiente sul disco e rigoroso nella risoluzione delle dipendenze, quindi è un'ottima scelta per monorepo o team che hanno già standardizzato pnpm.

```bash
pnpm dlx @delendai/cli init
pnpm dlx @delendai/cli validate
```

### yarn

Yarn resta un'alternativa familiare in molti progetti JavaScript, quindi questo percorso funziona bene quando strumenti e abitudini del team ruotano già attorno a Yarn.

```bash
yarn dlx @delendai/cli init
yarn dlx @delendai/cli validate
```

### bun

bun unisce runtime e gestore di pacchetti in un solo strumento, e delendai stesso è costruito con bun, quindi questo è il percorso più diretto quando bun è già disponibile sulla macchina.

```bash
bunx @delendai/cli init
bunx @delendai/cli validate
```

### deno

Deno può eseguire direttamente il pacchetto npm, cosa utile se preferisci un runtime sicuro di default con supporto TypeScript di prima classe e compatibilità npm.

```bash
deno run -A npm:@delendai/cli init
deno run -A npm:@delendai/cli validate
```

## Scegli il tuo IDE

Gli snippet qui sotto usano il preset solo via bun. Incolla il JSON così com'è nel file di destinazione e lascia che il tuo IDE registri il server stdio.

### VS Code

File: .vscode/mcp.json
Ambito: progetto

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

File: .cursor/mcp.json o ~/.cursor/mcp.json
Ambito: progetto / globale

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

File: ~/.codeium/windsurf/mcp_config.json
Ambito: globale

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

File: .mcp.json o tramite claude mcp add
Ambito: progetto

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

File: claude_desktop_config.json
Ambito: globale

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

File: ~/.gemini/antigravity-ide/mcp_config.json
Ambito: globale

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

File: settings.json
Ambito: globale

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

## Scegli un preset

I preset sono additivi. Parti dal set più piccolo ed espandi la superficie dei plugin solo quando il tuo flusso di lavoro ne ha davvero bisogno.

### minimal

- git
- search

### solo

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

- git
- search
- memory
- docs
- i18n
- link-check
- web-fetch
- env

### everything

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

## Verifica

Quando la configurazione è pronta, esegui un self-check con lo stesso gestore di pacchetti usato per l'installazione. Sostituisci `bunx` con `npx`, `pnpm dlx`, `yarn dlx` o `deno run -A npm:` se quello è il tuo percorso scelto.

```bash
bunx @delendai/cli validate
bunx @delendai/cli --preset=swarm --exclude-plugins=notification validate
```

Usa `--exclude-plugins=` quando vuoi sottrarre un plugin da un preset senza fare fork del preset, ad esempio per mantenere la base swarm ma rimuovere notification in una sessione single-agent.

## FAQ

### Perché `deno run -A npm:@delendai/cli` parte lentamente?

Deno risolve e verifica il pacchetto npm al primo utilizzo. Le esecuzioni successive riusano la cache in `~/.cache/deno`, ma per avvii locali ripetuti bun o npx restano più veloci.

### Il mio IDE non è in elenco. E adesso?

Qualsiasi IDE che accetti un server MCP via stdio può eseguire lo stesso server. Parti dal JSON di VS Code, cambia il percorso del file con quello previsto dal tuo IDE e mantieni lo stesso comando con gli stessi argomenti.

### Posso eseguire più preset insieme?

No. Una singola istanza del server risolve un solo preset alla volta. Se progetti diversi hanno bisogno di set di plugin differenti, metti un delendai.config.json dedicato in ogni progetto e lascia che il loader lo risolva per workspace.