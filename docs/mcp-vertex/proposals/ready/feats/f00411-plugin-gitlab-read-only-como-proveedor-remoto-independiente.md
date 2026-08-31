---
id: f00411
title: "Plugin GitLab read-only como proveedor remoto independiente"
kind: feat
status: ready
type: proposal
track: gitlab-read-only
date: 2026-08-31
---

# f00411 — Plugin GitLab read-only como proveedor remoto independiente

## Goal

Añadir una superficie tipada y limitada de lectura para GitLab.com y GitLab self-managed, usable sin checkout local y sin activar el plugin git, con proyectos, issues, merge requests, discusiones, commits, refs, pipelines, jobs, logs acotados, artefactos, releases, tags, deployments, variables metadata y búsqueda limitada.

## why

Los agentes necesitan inspeccionar estado remoto de GitLab aunque no exista repositorio clonado. GitLab tiene un modelo API propio y no debe contaminar las operaciones locales de git con HTTP, autenticación, paginación o rate limits.

## non-goals

- Implementar operaciones mutables.
- Hacer que el plugin dependa del plugin git.
- Devolver valores de tokens, secrets o variables protegidas.
- Usar red real en tests.

## architecture

### Activation and access requirements (English)

To inspect the repository that hosts `mcp-vertex`, enable the `gitlab` plugin and configure the actual GitLab project explicitly. The plugin works without the `git` plugin, without a local checkout, and without a configured `origin` remote.

- Set `GITLAB_TOKEN` (or the supported legacy GitLab token variable) in the process environment. Never place the token in `mcp-vertex.config.json`, source files, proposal files, logs, snapshots, or tool arguments.
- Set `GITLAB_URL` when the project is hosted on GitLab self-managed; leave it unset for GitLab.com. The configured host must pass the provider URL policy.
- Set a default project only if useful, using the numeric project ID or the URL-encoded namespace/project path. Otherwise pass the project explicitly to each tool. The project must be the GitLab project that actually contains `mcp-vertex`.
- Use a read-only token with the minimum `read_api` and `read_repository` permissions needed by the selected tools. Do not assume that every token can write.
- Enable write capabilities separately only in the later mutation proposal; read-only activation must not expose retries, comments, cancellations, tags, releases, or other mutations.
- If a local checkout is available, enable `git` separately and let a higher-level agent compose GitLab data with the local branch, SHA, diff, or remote URL. GitLab must remain fully functional when `git` is not enabled.

The plugin should report actionable errors for a missing token, unsupported host, 401, 403, 404, 429, timeout, or invalid response without revealing credentials.

## Slices

- global_gate: type

### S1 — Plugin, configuración y contexto de GitLab
- **Status**: pending
- **DependsOn**: [f00410:S1]
- **Files**: `plugins/gitlab/plugin.manifest.ts`, `plugins/gitlab/src/index.ts`, `plugins/gitlab/src/lib/config.ts`, `plugins/gitlab/src/lib/client.ts`, `plugins/gitlab/tests/plugin-options.spec.ts`
- **Gate**: type
- acceptance:
  - "Plugin opcional y registrable sin git activado ni checkout local."
  - "Admite GITLAB_TOKEN, alias compatible documentado, GITLAB_URL y proyecto por defecto opcional con precedencia clara."
  - "Cliente HTTP usa el contrato común, pagination/rate limits/retries/errores normalizados y URLs web/API."
  - "Permisos mínimos read_api/read_repository documentados; token ausente produce error accionable sin filtrarlo."

### S2 — Recursos de lectura GitLab y schemas
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `plugins/gitlab/src/lib/tools/context.tool.ts`, `plugins/gitlab/src/lib/tools/projects.tool.ts`, `plugins/gitlab/src/lib/tools/issues.tool.ts`, `plugins/gitlab/src/lib/tools/merge-requests.tool.ts`, `plugins/gitlab/src/lib/tools/commits.tool.ts`, `plugins/gitlab/src/lib/tools/refs.tool.ts`, `plugins/gitlab/src/lib/tools/pipelines.tool.ts`, `plugins/gitlab/src/lib/tools/jobs.tool.ts`, `plugins/gitlab/src/lib/tools/artifacts.tool.ts`, `plugins/gitlab/src/lib/tools/releases.tool.ts`, `plugins/gitlab/src/lib/tools/deployments.tool.ts`
- **Gate**: type
- acceptance:
  - "Incluye contexto, proyectos, issues, merge requests, comentarios/discusiones, commits, comparación de refs, pipelines, jobs, releases, tags, deployments y metadatos de variables."
  - "Cada tool define inputSchema/outputSchema tipados y devuelve outputs compactos normalizados, nunca respuestas HTTP crudas."
  - "Logs de jobs limitados por bytes/líneas/tiempo; artefactos limitados por tamaño y path containment en directorio temporal del plugin."
  - "Paginación y nextPage son explícitos; búsqueda acotada por límites."

### S3 — Tests herméticos y documentación GitLab
- **Status**: pending
- **DependsOn**: [S2]
- **Files**: `plugins/gitlab/tests/client.spec.ts`, `plugins/gitlab/tests/tools.spec.ts`, `plugins/gitlab/tests/security.spec.ts`, `plugins/gitlab/README.md`
- **Gate**: type
- acceptance:
  - "Cubre 200, paginación, 401, 403, 404, 429, timeout, respuesta inválida, logs/artefactos grandes, token ausente y token nunca visible."
  - "Valida inputSchema/outputSchema y truncación."
  - "Prueba GitLab.com, self-managed configurado, uso sin git e integración opcional con contexto local cuando exista."
  - "No usa red real."

## acceptance

- Plugin opcional y registrable sin git activado ni checkout local.
- Admite GITLAB_TOKEN, alias compatible documentado, GITLAB_URL y proyecto por defecto opcional con precedencia clara.
- Cliente HTTP usa el contrato común, pagination/rate limits/retries/errores normalizados y URLs web/API.
- Permisos mínimos read_api/read_repository documentados; token ausente produce error accionable sin filtrarlo.
- Incluye contexto, proyectos, issues, merge requests, comentarios/discusiones, commits, comparación de refs, pipelines, jobs, releases, tags, deployments y metadatos de variables.
- Cada tool define inputSchema/outputSchema tipados y devuelve outputs compactos normalizados, nunca respuestas HTTP crudas.
- Logs de jobs limitados por bytes/líneas/tiempo; artefactos limitados por tamaño y path containment en directorio temporal del plugin.
- Paginación y nextPage son explícitos; búsqueda acotada por límites.
- Cubre 200, paginación, 401, 403, 404, 429, timeout, respuesta inválida, logs/artefactos grandes, token ausente y token nunca visible.
- Valida inputSchema/outputSchema y truncación.
- Prueba GitLab.com, self-managed configurado, uso sin git e integración opcional con contexto local cuando exista.
- No usa red real.
