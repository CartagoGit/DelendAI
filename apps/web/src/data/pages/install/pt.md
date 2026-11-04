---
title: Instalar e executar
description: Instale o delendai, ligue-o ao seu IDE, escolha um preset e verifique o servidor antes de começar a trabalhar.
order: 1
navLabel: Instalar
---

# Instalar e executar

Adicione o delendai ao seu fluxo de trabalho, aponte o cliente MCP para o binário e verifique o conjunto de plugins resolvido antes da primeira sessão.

## Escolha o seu gestor de pacotes

Todos os gestores de pacotes abaixo executam o mesmo pacote publicado. Escolha o que a sua equipa já usa e mantenha os comandos exatamente como estão.

### npm

O Node Package Manager vem com o Node.js, por isso é a opção universal mais segura quando precisa da compatibilidade mais ampla entre máquinas e runners de CI.

```bash
npx -y @delendai/cli init
npx -y @delendai/cli validate
```

### pnpm

O pnpm é rápido, eficiente em disco e rigoroso na resolução de dependências, o que o torna uma ótima escolha para monorepos ou equipas que já padronizaram o pnpm.

```bash
pnpm dlx @delendai/cli init
pnpm dlx @delendai/cli validate
```

### yarn

O Yarn continua a ser uma alternativa familiar em muitos projetos JavaScript, por isso este caminho funciona bem quando as ferramentas e os hábitos da equipa já giram em torno do Yarn.

```bash
yarn dlx @delendai/cli init
yarn dlx @delendai/cli validate
```

### bun

O bun junta runtime e gestor de pacotes numa só ferramenta, e o próprio delendai é construído com bun, por isso este é o caminho mais direto quando o bun já está disponível na máquina.

```bash
bunx @delendai/cli init
bunx @delendai/cli validate
```

### deno

O Deno pode executar diretamente o pacote npm, o que é útil se preferir um runtime seguro por omissão com suporte de TypeScript de primeira classe e compatibilidade com npm.

```bash
deno run -A npm:@delendai/cli init
deno run -A npm:@delendai/cli validate
```

## Escolha o seu IDE

Os snippets abaixo usam o preset solo com bun. Cole o JSON no ficheiro de destino tal como está e deixe o seu IDE registar o servidor stdio.

### VS Code

Ficheiro: .vscode/mcp.json
Âmbito: projeto

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

Ficheiro: .cursor/mcp.json ou ~/.cursor/mcp.json
Âmbito: projeto / global

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

Ficheiro: ~/.codeium/windsurf/mcp_config.json
Âmbito: global

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

Ficheiro: .mcp.json ou via claude mcp add
Âmbito: projeto

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

Ficheiro: claude_desktop_config.json
Âmbito: global

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

Ficheiro: ~/.gemini/antigravity-ide/mcp_config.json
Âmbito: global

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

Ficheiro: settings.json
Âmbito: global

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

## Escolha um preset

Os presets são aditivos. Comece pelo conjunto menor e só alargue a superfície de plugins quando o seu fluxo de trabalho realmente precisar.

### minimal

Uso recomendado: orientação em modo leitura e smoke tests de CI.
Tamanho: 2 plugins · 42 ferramentas · ~11805 tokens no arranque

- git
- search

### solo

Uso recomendado: um programador e um agente no trabalho diário; é o valor por omissão do `init`.
Tamanho: 10 plugins · 79 ferramentas · ~19037 tokens no arranque

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

Uso recomendado: uma equipa que trabalha com pull requests, com convenções de commits e de testes.
Tamanho: 18 plugins · 116 ferramentas · ~25446 tokens no arranque

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

Uso recomendado: vários agentes a partilhar um checkout, com propostas, logs e marcadores de fecho.
Tamanho: 19 plugins · 125 ferramentas · ~26802 tokens no arranque

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

Uso recomendado: revisões e auditorias em modo leitura.
Tamanho: 15 plugins · 89 ferramentas · ~21955 tokens no arranque

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

Uso recomendado: documentação e sites web.
Tamanho: 8 plugins · 61 ferramentas · ~15696 tokens no arranque

- git
- search
- memory
- docs
- i18n
- link-check
- web-fetch
- env

### everything

Uso recomendado: diagnóstico com todos os plugins publicados, incluindo os que usam a rede ou credenciais.
Tamanho: 58 plugins · 236 ferramentas · ~59122 tokens no arranque

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

## Verificar

Depois de a configuração estar no sítio, execute um self-check com o mesmo gestor de pacotes que usou na instalação. Substitua `bunx` por `npx`, `pnpm dlx`, `yarn dlx` ou `deno run -A npm:` se esse for o seu caminho escolhido.

```bash
bunx @delendai/cli validate
bunx @delendai/cli --preset=swarm --exclude-plugins=notification validate
```

Use `--exclude-plugins=` quando quiser retirar um plugin de um preset sem fazer fork do preset, por exemplo para manter a base swarm mas remover notification numa sessão de agente único.

## FAQ

### Porque é que `deno run -A npm:@delendai/cli` arranca devagar?

O Deno resolve e verifica o pacote npm na primeira utilização. As execuções seguintes reutilizam a cache em `~/.cache/deno`, mas para arranques locais repetidos o bun ou o npx continuam a arrancar mais depressa.

### O meu IDE não está na lista. E agora?

Qualquer IDE que aceite um servidor MCP por stdio consegue executar o mesmo servidor. Parta do JSON do VS Code, mude o caminho do ficheiro para o que o seu IDE espera e mantenha o mesmo comando com os mesmos argumentos.

### Posso executar vários presets ao mesmo tempo?

Não. Uma instância do servidor resolve apenas um preset de cada vez. Se projetos diferentes precisarem de conjuntos de plugins distintos, coloque um delendai.config.json dedicado em cada projeto e deixe o loader resolvê-lo por workspace.