---
title: Instalar y ejecutar
description: Instala delendai, conéctalo a tu IDE, elige un preset y verifica el servidor antes de empezar a trabajar.
order: 1
navLabel: Instalar
---

# Instalar y ejecutar

Añade delendai a tu flujo de trabajo, apunta tu cliente MCP al binario y verifica el conjunto de plugins resuelto antes de la primera sesión.

## Elige tu gestor de paquetes

Todos los gestores de paquetes de abajo ejecutan el mismo paquete publicado. Elige el que ya use tu equipo y conserva los comandos tal como están.

### npm

Node Package Manager viene con Node.js, así que es la opción universal más segura cuando necesitas la compatibilidad más amplia entre máquinas y runners de CI.

```bash
npx -y @delendai/cli init
npx -y @delendai/cli validate
```

### pnpm

pnpm es rápido, eficiente en disco y estricto con la resolución de dependencias, por lo que encaja muy bien en monorepos o equipos que ya estandarizan pnpm.

```bash
pnpm dlx @delendai/cli init
pnpm dlx @delendai/cli validate
```

### yarn

Yarn sigue siendo una alternativa familiar en muchos proyectos JavaScript, así que esta ruta funciona bien cuando tus herramientas y hábitos del equipo ya giran alrededor de Yarn.

```bash
yarn dlx @delendai/cli init
yarn dlx @delendai/cli validate
```

### bun

bun agrupa runtime y gestor de paquetes en una sola herramienta, y delendai está construido con bun, así que es la ruta más directa cuando bun ya está disponible en la máquina.

```bash
bunx @delendai/cli init
bunx @delendai/cli validate
```

### deno

Deno puede ejecutar el paquete npm directamente, lo cual viene bien si prefieres un runtime seguro por defecto con soporte de TypeScript de primera clase y compatibilidad con npm.

```bash
deno run -A npm:@delendai/cli init
deno run -A npm:@delendai/cli validate
```

## Elige tu IDE

Los snippets de abajo usan el preset solo sobre bun. Pega el JSON en el archivo objetivo tal cual y deja que tu IDE registre el servidor stdio.

### VS Code

Archivo: .vscode/mcp.json
Alcance: proyecto

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

Archivo: .cursor/mcp.json o ~/.cursor/mcp.json
Alcance: proyecto / global

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

Archivo: ~/.codeium/windsurf/mcp_config.json
Alcance: global

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

Archivo: .mcp.json o mediante claude mcp add
Alcance: proyecto

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

Archivo: claude_desktop_config.json
Alcance: global

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

Archivo: ~/.gemini/antigravity-ide/mcp_config.json
Alcance: global

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

Archivo: settings.json
Alcance: global

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

## Instalar una vez para todos los proyectos

El CLI puede fusionar el mismo servidor MCP en las configuraciones globales
de los hosts compatibles, para que cada repositorio no necesite su propio
archivo MCP escrito a mano:

```bash
delendai init:global --all
```

Para seleccionar solo algunos hosts globales:

```bash
delendai init:global --ide=cursor-global,windsurf,claude-desktop,antigravity,zed
```

El comando está separado deliberadamente de `init`: nunca escribe archivos
del proyecto como `.vscode/mcp.json`, `.cursor/mcp.json` o `.mcp.json`.
Conserva servidores MCP y ajustes no relacionados, y se puede ejecutar de
nuevo de forma segura. Los destinos exclusivos de proyecto (`vscode`,
`cursor` y `claude-code`), los ids desconocidos y un valor vacío en `--ide=`
se rechazan en lugar de activar la autodetección.

`init:global` instala la conexión MCP, no una segunda copia de las reglas de
los agentes. El mismo conjunto de herramientas MCP y el bootstrap canónico
están disponibles para cualquier host compatible con MCP, incluidos Copilot,
Claude, Cursor, Codex, Continue y Aider. Ejecuta `delendai init` o
`delendai init:default` dentro de un repositorio cuando el host necesite punteros
de instrucciones locales, adaptadores de agentes, skills o un archivo
`delendai.config.json` específico del proyecto.

## Elige un preset

Los presets son aditivos. Empieza con el conjunto más pequeño y amplíalo solo cuando tu flujo realmente necesite más superficie.

### minimal

Uso recomendado: orientación de solo lectura y smoke tests de CI.
Tamaño: 2 plugins · 42 herramientas · ~11805 tokens en el arranque

- git
- search

### solo

Uso recomendado: un desarrollador y un agente en el trabajo diario; es el valor por defecto de `init`.
Tamaño: 10 plugins · 79 herramientas · ~19037 tokens en el arranque

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

Uso recomendado: un equipo que trabaja con pull requests, con convenciones de commits y de tests.
Tamaño: 18 plugins · 116 herramientas · ~25446 tokens en el arranque

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

Uso recomendado: varios agentes que comparten un checkout, con propuestas, logs y marcadores de cierre.
Tamaño: 19 plugins · 125 herramientas · ~26802 tokens en el arranque

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

Uso recomendado: revisiones y auditorías de solo lectura.
Tamaño: 15 plugins · 89 herramientas · ~21955 tokens en el arranque

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

Uso recomendado: documentación y sitios web.
Tamaño: 8 plugins · 61 herramientas · ~15696 tokens en el arranque

- git
- search
- memory
- docs
- i18n
- link-check
- web-fetch
- env

### everything

Uso recomendado: diagnóstico con todos los plugins publicados, incluidos los que usan la red o credenciales.
Tamaño: 58 plugins · 236 herramientas · ~59122 tokens en el arranque

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

Cuando la configuración ya esté en su sitio, ejecuta un self-check con el mismo gestor de paquetes que usaste para instalar. Sustituye `bunx` por `npx`, `pnpm dlx`, `yarn dlx` o `deno run -A npm:` si esa es tu ruta elegida.

```bash
bunx @delendai/cli validate
bunx @delendai/cli --preset=swarm --exclude-plugins=notification validate
```

Usa `--exclude-plugins=` cuando quieras restar un plugin de un preset sin hacer fork del preset, por ejemplo para conservar la base swarm pero quitar notification en una sesión de un solo agente.

## FAQ

### ¿Por qué `deno run -A npm:@delendai/cli` tarda en arrancar?

Deno resuelve y verifica el paquete npm en el primer uso. Las siguientes ejecuciones reutilizan la caché en `~/.cache/deno`, pero para lanzamientos locales repetidos bun o npx siguen arrancando más rápido.

### Mi IDE no aparece en la lista. ¿Ahora qué?

Cualquier IDE que acepte un servidor MCP por stdio puede ejecutar el mismo servidor. Parte del JSON de VS Code, cambia la ruta del archivo por la que espere tu IDE y conserva el mismo comando con sus argumentos.

### ¿Puedo ejecutar varios presets a la vez?

No. Una instancia del servidor resuelve un solo preset cada vez. Si distintos proyectos necesitan conjuntos de plugins distintos, coloca un delendai.config.json dedicado en cada proyecto y deja que el loader lo resuelva por workspace.