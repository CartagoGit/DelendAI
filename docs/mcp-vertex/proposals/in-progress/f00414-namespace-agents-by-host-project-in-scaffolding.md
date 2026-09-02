---
id: f00414
title: "Namespace agents by host project in scaffolding"
kind: feat
status: in-progress
type: proposal
track: scaffolding+agents+error-reporting
date: 2026-08-31
---

# f00414 — Namespace agents by host project in scaffolding

## Goal

Resolver GitHub issue #52 (https://github.com/CartagoGit/mcp-vertex/issues/52): asociar agentes y declaraciones al namespace del proyecto host, con adaptadores para Copilot, Claude y Codex, limpieza de artefactos obsoletos y uso del namespace MCP configurado. El commit de implementación debe incluir `Closes #52` para cerrar la issue al hacer merge y registrar después su SHA en esta propuesta.

## why

El scaffolding actual impone nombres `mcp-vertex-*` y mezcla namespaces entre proyectos host, produciendo configuraciones ambiguas, copias antiguas y herramientas ligadas a un namespace fijo.

## non-goals

- No cambiar el contrato MCP fuera de lo necesario para propagar el namespace configurado.
- No rediseñar agentes o prompts fuera de initialize, pair y fix.
- No cerrar manualmente la issue #52; el cierre debe producirse por el commit mergeado con `Closes #52`.

## Slices

- global_gate: type

### S1 — Shared scaffolding and namespace contract
- **Status**: pending
- **Files**: `packages/core/src/**`, `plugins/**/src/**`, `docs/mcp-vertex/**`
- **Gate**: type
- acceptance:
  - "Definir un contrato compartido para scaffolding, naming de agentes y namespace MCP."
  - "Resolver el namespace del proyecto host sin asumir `mcp-vertex-*` como valor global."
  - "Documentar la referencia a GitHub issue #52."
- review-state: changes_requested
- review-implementer: copilot-implementation-runner
- review-reviewer: delivery_verifier
- review-log: requested_changes by delivery_verifier — Corregir adopt_project y adoption-assessment para propagar mcpServerName/namespacePrefix configurados por el host, eliminando el hardcode mcp-vertex/* en agentes generados. Validar con tests de adopt/scaffold y typecheck de core/CLI.
### S2 — Host-specific adapters and stale artifact cleanup
- **Status**: pending
- **Files**: `.github/agents/**`, `.claude/agents/**`, `.codex/agents/**`, `extensions/vscode/**`, `apps/shared/**`
- **Gate**: type
- acceptance:
  - "Copilot usa `.github/agents`, Claude `.claude/agents` y Codex `.codex/agents`."
  - "Los nombres físicos y declarados son coherentes con el proyecto host."
  - "initialize, pair y fix eliminan copias antiguas y declaraciones obsoletas."

### S3 — Initialize pair fix and tools integration tests
- **Status**: pending
- **Files**: `packages/**/tests/**`, `plugins/**/tests/**`, `extensions/vscode/tests/**`, `apps/**/tests/**`
- **Gate**: type
- acceptance:
  - "Añadir pruebas para initialize, pair y fix."
  - "Verificar que tools usa el namespace MCP configurado."
  - "Verificar que no quedan artefactos obsoletos tras cada operación."

### S4 — Error reporting and delivery traceability
- **Status**: pending
- **Files**: `plugins/error-reporting/**`, `docs/mcp-vertex/proposals/**`, `CHANGELOG.md`
- **Gate**: type
- acceptance:
  - "Añadir pruebas de error-reporting para namespaces y scaffolding."
  - "Registrar el SHA del commit de implementación cuando exista."
  - "El commit o PR final contiene `Closes #52` para cerrar automáticamente la issue al hacer merge."

## acceptance

- Definir un contrato compartido para scaffolding, naming de agentes y namespace MCP.
- Resolver el namespace del proyecto host sin asumir `mcp-vertex-*` como valor global.
- Documentar la referencia a GitHub issue #52.
- Copilot usa `.github/agents`, Claude `.claude/agents` y Codex `.codex/agents`.
- Los nombres físicos y declarados son coherentes con el proyecto host.
- initialize, pair y fix eliminan copias antiguas y declaraciones obsoletas.
- Añadir pruebas para initialize, pair y fix.
- Verificar que tools usa el namespace MCP configurado.
- Verificar que no quedan artefactos obsoletos tras cada operación.
- Añadir pruebas de error-reporting para namespaces y scaffolding.
- Registrar el SHA del commit de implementación cuando exista.
- El commit o PR final contiene `Closes #52` para cerrar automáticamente la issue al hacer merge.

## Notes

- **Issue de origen**: [#52 — Project scaffolding must namespace agents by host project](https://github.com/CartagoGit/mcp-vertex/issues/52)
- **Cierre automático**: el commit o PR que integre la implementación debe incluir `Closes #52`.
- **Commit de implementación**: `3d672fcab3ecc50edc206445ce518e30c7b7afd8`.

### Implementación verificada

La ruta real de scaffolding está en `packages/cli/src/lib/init/`, no en los
globs amplios de esta propuesta. La implementación namespace-aware quedó
incorporada por trabajo concurrente en estos commits:

- `1bc84572cbd488866aed0b6df65489e55b27f992` — propagación del namespace en
  render de agentes y configuración MCP.
- `1cadf6d6153b77bcad9f213c65114649a1321c27` — propagación al writer de
  `init` y regresiones de fresh-install/merge.

Validación focalizada: 3 archivos de test, 45 tests correctos; typecheck de
`packages/cli` correcto. El typecheck global queda bloqueado por cambios
concurrentes ajenos en `plugins/gitlab/src/lib/config.ts`.

No existe una operación independiente `pair` en la ruta de scaffolding
actual; `fix`/`repair` aparecen como vocabulario de otras superficies, no
como una segunda operación de initialize que pueda corregirse aquí sin
inventar archivos o contratos.

Closes #52
