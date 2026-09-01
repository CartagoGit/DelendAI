---
id: f00412
title: "Plugin GitHub read-only como proveedor remoto independiente"
kind: feat
status: ready
type: proposal
track: github-read-only
date: 2026-08-31
---

# f00412 — Plugin GitHub read-only como proveedor remoto independiente

## Goal

Añadir una superficie tipada y limitada de lectura para GitHub.com y GitHub Enterprise, usable sin checkout local y sin activar el plugin git, con repositorios, issues, pull requests, comentarios, reviews, commits, statuses, checks, workflows, runs, jobs, logs, artefactos, releases, tags, deployments, variables metadata y búsqueda limitada.

## why

Los agentes necesitan inspeccionar estado remoto de GitHub aunque no exista repositorio clonado. GitHub tiene un modelo API propio y no debe mezclarse con las operaciones locales de git.

## non-goals

- Implementar operaciones mutables.
- Hacer que el plugin dependa del plugin git.
- Devolver valores de tokens, secrets o variables protegidas.
- Usar red real en tests.

## architecture

### Activation and access requirements (English)

To inspect the repository that hosts `mcp-vertex`, enable the `github` plugin and configure the actual GitHub repository explicitly. The plugin works without the `git` plugin, without a local checkout, and without a configured `origin` remote.

- Set `GITHUB_TOKEN` in the process environment. Never place the token in `mcp-vertex.config.json`, source files, proposal files, logs, snapshots, or tool arguments.
- Set `GITHUB_API_URL` when the repository is hosted on GitHub Enterprise Server; leave it unset for GitHub.com. The configured API host must pass the provider URL policy.
- Set the default `owner` and `repository` only when useful. Otherwise pass them explicitly to each tool. They must identify the GitHub repository that actually contains `mcp-vertex`; do not rely on the local directory name.
- Use a read-only token with the minimum repository metadata, contents, issues, pull requests, Actions/checks, releases, deployments, and security visibility permissions needed by the selected tools. Do not assume that every token can write.
- Enable write capabilities separately only in the later mutation proposal; read-only activation must not expose comments, dispatches, retries, cancellations, tags, releases, or other mutations.
- If a local checkout is available, enable `git` separately and let a higher-level agent compose GitHub data with the local branch, SHA, diff, or remote URL. GitHub must remain fully functional when `git` is not enabled.

The plugin should report actionable errors for a missing token, unsupported host, 401, 403, 404, 429, timeout, or invalid response without revealing credentials.

## Slices

- global_gate: type

### S1 — Plugin, configuración y cliente de GitHub
- **Status**: pending
- **DependsOn**: [f00410:S1]
- **Files**: `plugins/github/plugin.manifest.ts`, `plugins/github/src/index.ts`, `plugins/github/src/lib/config.ts`, `plugins/github/src/lib/client.ts`, `plugins/github/tests/plugin-options.spec.ts`
- **Gate**: type
- acceptance:
  - "Plugin opcional y registrable sin git activado ni checkout local."
  - "Admite GITHUB_TOKEN, GITHUB_API_URL, propietario y repositorio por defecto opcionales con precedencia clara."
  - "Cliente HTTP usa el contrato común, pagination/rate limits/retries/errores normalizados y soporta GitHub.com/GitHub Enterprise."
  - "Permisos mínimos read documentados; token ausente produce error accionable sin filtrarlo."

### S2 — Recursos de lectura GitHub y schemas
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `plugins/github/src/lib/tools/context.tool.ts`, `plugins/github/src/lib/tools/repositories.tool.ts`, `plugins/github/src/lib/tools/issues.tool.ts`, `plugins/github/src/lib/tools/pull-requests.tool.ts`, `plugins/github/src/lib/tools/commits.tool.ts`, `plugins/github/src/lib/tools/checks.tool.ts`, `plugins/github/src/lib/tools/workflows.tool.ts`, `plugins/github/src/lib/tools/jobs.tool.ts`, `plugins/github/src/lib/tools/artifacts.tool.ts`, `plugins/github/src/lib/tools/releases.tool.ts`, `plugins/github/src/lib/tools/deployments.tool.ts`
- **Gate**: type
- acceptance:
  - "Incluye contexto, repositorios, issues, pull requests, comentarios, reviews, commits, statuses, check runs, workflows/runs, jobs, logs, artefactos, releases, tags, deployments y metadatos de variables."
  - "Cada tool define inputSchema/outputSchema tipados y devuelve outputs compactos normalizados, nunca respuestas HTTP crudas."
  - "Logs limitados por bytes/líneas/tiempo; artefactos limitados por tamaño y path containment en directorio temporal del plugin."
  - "Paginación y nextPage son explícitos; búsqueda acotada por límites."

### S3 — Tests herméticos y documentación GitHub
- **Status**: pending
- **DependsOn**: [S2]
- **Files**: `plugins/github/tests/client.spec.ts`, `plugins/github/tests/tools.spec.ts`, `plugins/github/tests/security.spec.ts`, `plugins/github/README.md`
- **Gate**: type
- acceptance:
  - "Cubre 200, paginación, 401, 403, 404, 429, timeout, respuesta inválida, logs/artefactos grandes, token ausente y token nunca visible."
  - "Valida inputSchema/outputSchema y truncación."
  - "Prueba GitHub.com, Enterprise configurado, uso sin git e integración opcional con contexto local cuando exista."
  - "No usa red real."

## acceptance

- Plugin opcional y registrable sin git activado ni checkout local.
- Admite GITHUB_TOKEN, GITHUB_API_URL, propietario y repositorio por defecto opcionales con precedencia clara.
- Cliente HTTP usa el contrato común, pagination/rate limits/retries/errores normalizados y soporta GitHub.com/GitHub Enterprise.
- Permisos mínimos read documentados; token ausente produce error accionable sin filtrarlo.
- Incluye contexto, repositorios, issues, pull requests, comentarios, reviews, commits, statuses, check runs, workflows/runs, jobs, logs, artefactos, releases, tags, deployments y metadatos de variables.
- Cada tool define inputSchema/outputSchema tipados y devuelve outputs compactos normalizados, nunca respuestas HTTP crudas.
- Logs limitados por bytes/líneas/tiempo; artefactos limitados por tamaño y path containment en directorio temporal del plugin.
- Paginación y nextPage son explícitos; búsqueda acotada por límites.
- Cubre 200, paginación, 401, 403, 404, 429, timeout, respuesta inválida, logs/artefactos grandes, token ausente y token nunca visible.
- Valida inputSchema/outputSchema y truncación.
- Prueba GitHub.com, Enterprise configurado, uso sin git e integración opcional con contexto local cuando exista.
- No usa red real.
