---
title: Instalar e executar
description: Instale o mcp-vertex, ligue-o ao seu IDE, escolha um preset e verifique o servidor antes de começar a trabalhar.
order: 1
navLabel: Instalar
---

# Instalar e executar

Adicione o mcp-vertex ao seu fluxo de trabalho, aponte o cliente MCP para o binário e verifique o conjunto de plugins resolvido antes da primeira sessão.

## Escolha o seu gestor de pacotes

Todos os gestores de pacotes abaixo executam o mesmo pacote publicado. Escolha o que a sua equipa já usa e mantenha os comandos exatamente como estão.

### npm

O Node Package Manager vem com o Node.js, por isso é a opção universal mais segura quando precisa da compatibilidade mais ampla entre máquinas e runners de CI.

```bash
npx -y @mcp-vertex/core init
npx -y @mcp-vertex/core --check
```

### pnpm

O pnpm é rápido, eficiente em disco e rigoroso na resolução de dependências, o que o torna uma ótima escolha para monorepos ou equipas que já padronizaram o pnpm.

```bash
pnpm dlx @mcp-vertex/core init
pnpm dlx @mcp-vertex/core --check
```

### yarn

O Yarn continua a ser uma alternativa familiar em muitos projetos JavaScript, por isso este caminho funciona bem quando as ferramentas e os hábitos da equipa já giram em torno do Yarn.

```bash
yarn dlx @mcp-vertex/core init
yarn dlx @mcp-vertex/core --check
```

### bun

O bun junta runtime e gestor de pacotes numa só ferramenta, e o próprio mcp-vertex é construído com bun, por isso este é o caminho mais direto quando o bun já está disponível na máquina.

```bash
bunx @mcp-vertex/core init
bunx @mcp-vertex/core --check
```

### deno

O Deno pode executar diretamente o pacote npm, o que é útil se preferir um runtime seguro por omissão com suporte de TypeScript de primeira classe e compatibilidade com npm.

```bash
deno run -A npm:@mcp-vertex/core init
deno run -A npm:@mcp-vertex/core --check
```

## Escolha o seu IDE

Os snippets abaixo usam o preset standard com bun. Cole o JSON no ficheiro de destino tal como está e deixe o seu IDE registar o servidor stdio.

### VS Code

Ficheiro: .vscode/mcp.json
Âmbito: projeto

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

Ficheiro: .cursor/mcp.json ou ~/.cursor/mcp.json
Âmbito: projeto / global

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

Ficheiro: ~/.codeium/windsurf/mcp_config.json
Âmbito: global

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

Ficheiro: .mcp.json ou via claude mcp add
Âmbito: projeto

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

Ficheiro: claude_desktop_config.json
Âmbito: global

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

Ficheiro: ~/.gemini/antigravity-ide/mcp_config.json
Âmbito: global

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

Ficheiro: settings.json
Âmbito: global

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

## Escolha um preset

Os presets são aditivos. Comece pelo conjunto menor e só alargue a superfície de plugins quando o seu fluxo de trabalho realmente precisar.

### minimal

Uso recomendado: orientação em modo leitura e smoke tests de CI.
Tamanho: 2 plugins.

- git
- search

### standard

Uso recomendado: trabalho de agente único com memória, docs, ajuda de lint, tipos e dependências.
Tamanho: 7 plugins.

- git
- search
- memory
- docs
- rules
- quality
- deps

### swarm

Uso recomendado: coordenação multiagente com locks, notificações, logs e marcadores de fecho. Audit continua a ser opt-in e deve ser carregado separadamente no fim de uma ronda.
Tamanho: 13 plugins.

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

Uso recomendado: o preset swarm mais integrações host-only como web-fetch e issues, quando o host as expõe.
Tamanho: 15 plugins.

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

## Verificar

Depois de a configuração estar no sítio, execute um self-check com o mesmo gestor de pacotes que usou na instalação. Substitua `bunx` por `npx`, `pnpm dlx`, `yarn dlx` ou `deno run -A npm:` se esse for o seu caminho escolhido.

```bash
bunx @mcp-vertex/core --check
bunx @mcp-vertex/core --preset=swarm --exclude-plugins=notification --check
```

Use `--exclude-plugins=` quando quiser retirar um plugin de um preset sem fazer fork do preset, por exemplo para manter a base swarm mas remover notification numa sessão de agente único.

## FAQ

### Porque é que `deno run -A npm:@mcp-vertex/core` arranca devagar?

O Deno resolve e verifica o pacote npm na primeira utilização. As execuções seguintes reutilizam a cache em `~/.cache/deno`, mas para arranques locais repetidos o bun ou o npx continuam a arrancar mais depressa.

### O meu IDE não está na lista. E agora?

Qualquer IDE que aceite um servidor MCP por stdio consegue executar o mesmo servidor. Parta do JSON do VS Code, mude o caminho do ficheiro para o que o seu IDE espera e mantenha o mesmo comando com os mesmos argumentos.

### Posso executar vários presets ao mesmo tempo?

Não. Uma instância do servidor resolve apenas um preset de cada vez. Se projetos diferentes precisarem de conjuntos de plugins distintos, coloque um mcp-vertex.config.json dedicado em cada projeto e deixe o loader resolvê-lo por workspace.