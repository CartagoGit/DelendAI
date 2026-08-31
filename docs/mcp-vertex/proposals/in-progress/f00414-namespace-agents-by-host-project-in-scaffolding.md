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
- **Status**: done
- **Files**: `packages/cli/src/lib/init/init-answers.schema.ts`, `packages/cli/src/lib/init/init-render.service.ts`, `packages/cli/src/commands/init/init.command.ts`
- **Gate**: type
- acceptance:
  - "El scaffolding acepta namespace de proyecto y nombre de servidor MCP configurables."
  - "Copilot, Claude y Codex reciben nombres derivados del namespace del host."

### S2 — Host-specific adapters and stale artifact cleanup
- **Status**: done
- **Files**: `packages/cli/src/lib/init/init-render.service.ts`, `packages/cli/src/lib/init/init-writers.factory.ts`, `packages/cli/src/commands/init/init-global.command.ts`
- **Gate**: type
- acceptance:
  - "Copilot usa `.github/agents`, Claude `.claude/agents` y Codex `.codex/agents`."
  - "La configuración MCP usa el nombre de servidor configurado."
  - "Los paths generados respetan el namespace solicitado."

### S3 — Initialize pair fix and tools integration tests
- **Status**: done
- **Files**: `packages/cli/src/lib/init/init-render.service.spec.ts`, `packages/cli/src/lib/init/init-writers.factory.spec.ts`
- **Gate**: type
- acceptance:
  - "Las pruebas cubren namespace personalizado y servidor MCP personalizado."
  - "Las pruebas cubren instalación nueva y merge de configuración existente."

### S4 — Error reporting and delivery traceability
- **Status**: in-progress
- **Files**: `docs/mcp-vertex/proposals/in-progress/f00414-namespace-agents-by-host-project-in-scaffolding.md`
- **Gate**: type
- acceptance:
  - "La propuesta registra el SHA del commit de implementación."
  - "El commit o PR final contiene `Closes #52` para cerrar automáticamente la issue al hacer merge."

## acceptance

- El scaffolding acepta namespace de proyecto y nombre de servidor MCP configurables.
- Copilot usa `.github/agents`, Claude `.claude/agents` y Codex `.codex/agents`.
- Los nombres físicos y declarados son coherentes con el proyecto host.
- La configuración MCP usa el namespace de servidor configurado.
- Las pruebas cubren instalación nueva y merge de configuración existente.
- La propuesta registra el SHA del commit de implementación.
- El commit o PR final contiene `Closes #52` para cerrar automáticamente la issue al hacer merge.

## Trazabilidad GitHub

- **Issue de origen**: [#52 — Project scaffolding must namespace agents by host project](https://github.com/CartagoGit/mcp-vertex/issues/52)
- **Cierre automático**: el commit o PR que integre la implementación contiene `Closes #52`.
- **Commit de implementación**: `50abaa1119b2060028fabe3a1505a832293474ae`.

## Implementación verificada

La ruta real de scaffolding está en `packages/cli/src/lib/init/` y en los comandos `init`. La implementación namespace-aware cubre los writers de instalación nueva y merge, los formatos de agente de Copilot, Claude y Codex y el nombre configurable del servidor MCP.

Validación focalizada: 3 archivos de test, 46 tests correctos; typecheck de `packages/cli` correcto. El hook de commit también validó el formato y la disciplina de rama.

No existe una operación independiente `pair` en la ruta de scaffolding actual; la propuesta no inventa una API separada para ella.

Closes #52