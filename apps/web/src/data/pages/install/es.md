---
title: Instalar y ejecutar
description: Instala mcp-vertex, conéctalo a tu IDE, elige un preset y verifica el servidor antes de empezar a trabajar.
order: 1
navLabel: Instalar
---

# Instalar y ejecutar

Añade mcp-vertex a tu flujo de trabajo, apunta tu cliente MCP al binario y verifica el conjunto de plugins resuelto antes de la primera sesión.

## Elige tu gestor de paquetes

Todos los gestores de paquetes de abajo ejecutan el mismo paquete publicado. Elige el que ya use tu equipo y conserva los comandos tal como están.

### npm

Node Package Manager viene con Node.js, así que es la opción universal más segura cuando necesitas la compatibilidad más amplia entre máquinas y runners de CI.

```bash
npx -y @mcp-vertex/cli init
npx -y @mcp-vertex/cli validate
```

### pnpm

pnpm es rápido, eficiente en disco y estricto con la resolución de dependencias, por lo que encaja muy bien en monorepos o equipos que ya estandarizan pnpm.

```bash
pnpm dlx @mcp-vertex/cli init
pnpm dlx @mcp-vertex/cli validate
```

### yarn

Yarn sigue siendo una alternativa familiar en muchos proyectos JavaScript, así que esta ruta funciona bien cuando tus herramientas y hábitos del equipo ya giran alrededor de Yarn.

```bash
yarn dlx @mcp-vertex/cli init
yarn dlx @mcp-vertex/cli validate
```

### bun

bun agrupa runtime y gestor de paquetes en una sola herramienta, y mcp-vertex está construido con bun, así que es la ruta más directa cuando bun ya está disponible en la máquina.

```bash
bunx @mcp-vertex/cli init
bunx @mcp-vertex/cli validate
```

### deno

Deno puede ejecutar el paquete npm directamente, lo cual viene bien si prefieres un runtime seguro por defecto con soporte de TypeScript de primera clase y compatibilidad con npm.

```bash
deno run -A npm:@mcp-vertex/cli init
deno run -A npm:@mcp-vertex/cli validate
```

## Elige tu IDE

Los snippets de abajo usan el preset standard sobre bun. Pega el JSON en el archivo objetivo tal cual y deja que tu IDE registre el servidor stdio.

### VS Code

Archivo: .vscode/mcp.json
Alcance: proyecto

```json
{
  "servers": {
    "mcp-vertex": {
      "type": "stdio",
      "command": "bunx",
      "args": [
        "--package",
        "@mcp-vertex/cli",
        "mcpv",
        "__serve",
        "--workspace",
        ".",
        "--preset",
        "standard"
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
    "mcp-vertex": {
      "command": "bunx",
      "args": [
        "--package",
        "@mcp-vertex/cli",
        "mcpv",
        "__serve",
        "--workspace",
        ".",
        "--preset",
        "standard"
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
    "mcp-vertex": {
      "command": "bunx",
      "args": [
        "--package",
        "@mcp-vertex/cli",
        "mcpv",
        "__serve",
        "--workspace",
        ".",
        "--preset",
        "standard"
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
    "mcp-vertex": {
      "command": "bunx",
      "args": [
        "--package",
        "@mcp-vertex/cli",
        "mcpv",
        "__serve",
        "--workspace",
        ".",
        "--preset",
        "standard"
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
    "mcp-vertex": {
      "command": "bunx",
      "args": [
        "--package",
        "@mcp-vertex/cli",
        "mcpv",
        "__serve",
        "--workspace",
        ".",
        "--preset",
        "standard"
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
    "mcp-vertex": {
      "command": "bunx",
      "args": [
        "--package",
        "@mcp-vertex/cli",
        "mcpv",
        "__serve",
        "--workspace",
        ".",
        "--preset",
        "standard"
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
    "mcp-vertex": {
      "command": "bunx",
      "args": [
        "--package",
        "@mcp-vertex/cli",
        "mcpv",
        "__serve",
        "--workspace",
        ".",
        "--preset",
        "standard"
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
mcpv init:global --all
```

Para seleccionar solo algunos hosts globales:

```bash
mcpv init:global --ide=cursor-global,windsurf,claude-desktop,antigravity,zed
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
Claude, Cursor, Codex, Continue y Aider. Ejecuta `mcpv init` o
`mcpv init:default` dentro de un repositorio cuando el host necesite punteros
de instrucciones locales, adaptadores de agentes, skills o un archivo
`mcp-vertex.config.json` específico del proyecto.

## Elige un preset

Los presets son aditivos. Empieza con el conjunto más pequeño y amplíalo solo cuando tu flujo realmente necesite más superficie.

### minimal

Uso recomendado: orientación de solo lectura y smoke tests de CI.
Tamaño: 2 plugins.

- git
- search

### standard

Uso recomendado: trabajo de agente único con memoria, docs, ayuda de lint, tipos y dependencias.
Tamaño: 7 plugins.

- git
- search
- memory
- docs
- rules
- quality
- deps

### swarm

Uso recomendado: coordinación multiagente con locks, notificaciones, logs y marcadores de cierre. Audit sigue siendo opt-in y debe cargarse aparte cuando termine la ronda.
Tamaño: 13 plugins.

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

Uso recomendado: el preset swarm más integraciones solo de host como web-fetch e issues, cuando el host las expone.
Tamaño: 15 plugins.

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

Cuando la configuración ya esté en su sitio, ejecuta un self-check con el mismo gestor de paquetes que usaste para instalar. Sustituye `bunx` por `npx`, `pnpm dlx`, `yarn dlx` o `deno run -A npm:` si esa es tu ruta elegida.

```bash
bunx @mcp-vertex/cli validate
bunx @mcp-vertex/cli --preset=swarm --exclude-plugins=notification validate
```

Usa `--exclude-plugins=` cuando quieras restar un plugin de un preset sin hacer fork del preset, por ejemplo para conservar la base swarm pero quitar notification en una sesión de un solo agente.

## FAQ

### ¿Por qué `deno run -A npm:@mcp-vertex/cli` tarda en arrancar?

Deno resuelve y verifica el paquete npm en el primer uso. Las siguientes ejecuciones reutilizan la caché en `~/.cache/deno`, pero para lanzamientos locales repetidos bun o npx siguen arrancando más rápido.

### Mi IDE no aparece en la lista. ¿Ahora qué?

Cualquier IDE que acepte un servidor MCP por stdio puede ejecutar el mismo servidor. Parte del JSON de VS Code, cambia la ruta del archivo por la que espere tu IDE y conserva el mismo comando con sus argumentos.

### ¿Puedo ejecutar varios presets a la vez?

No. Una instancia del servidor resuelve un solo preset cada vez. Si distintos proyectos necesitan conjuntos de plugins distintos, coloca un mcp-vertex.config.json dedicado en cada proyecto y deja que el loader lo resuelva por workspace.