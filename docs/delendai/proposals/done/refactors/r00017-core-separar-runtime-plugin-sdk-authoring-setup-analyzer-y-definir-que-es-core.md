---
id: r00017
title: "core: separar runtime/plugin-sdk/authoring/setup/analyzer y definir qué es core"
kind: refactor
status: done
type: proposal
track: core
date: 2026-08-24
---

# r00017 — core: separar runtime/plugin-sdk/authoring/setup/analyzer y definir qué es core

## Goal

Separar las responsabilidades del core y definir qué significa "core" en este proyecto.

Parte del plan `q00003`. Referencias legadas (`docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md`):

- §12 CORE-001 — revisar responsabilidades de `core`
- §12 CORE-002 — definir qué significa "core" (solo invariantes runtime)
- §12 CORE-003 — reducir imports no necesarios en runtime (medir cold startup, module count, memory, bundle size)
- §12 CORE-004 — mantener pocas dependencias externas (MCP SDK + Zod, no degradar)
- §28 CHECK-005 — validar que la división mejora startup/build de forma material

División propuesta: `@mcp-vertex/runtime`, `@mcp-vertex/plugin-sdk`, `@mcp-vertex/authoring`, `@mcp-vertex/setup`, `@mcp-vertex/analyzer`. El runtime debe ser "aburrido": contracts, plugin lifecycle, server assembly, workspace security, response helpers, metrics. CHECK-005 antes de dividir: medir y solo dividir si mejora de forma material.

## why

El core ya contiene agents, bootstrap, cache, catalog, CLI assembly, config, hosts, install, knowledge, metrics, scaffolding, setup, skills, tools y workspace. Un runtime "aburrido" y pequeño mejora startup, tree shaking, testabilidad y permite usar MCP Vertex como SDK sin importar tooling de authoring.

## non-goals

- No dividir en packages si CHECK-005 no muestra mejora material.
- No añadir dependencias externas.
- No tocar la semántica pública de los plugins.

## Slices

- global_gate: type

### S1 — Definir el límite de core (documentación)
- **Status**: done
- **Files**: `docs/mcp-vertex/ARCHITECTURE.md`
- **Gate**: type
- acceptance:
  - "Documenta qué es core (invariantes runtime) y qué no (authoring/setup/analyzer)."
  - "CORE-002 resuelto con una definición explícita."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Redo. Revisado en profundidad (cold-start re-ejecutado). validate verde.
### S2 — Medición cold-start antes/después
- **Status**: done
- **Files**: `tools/scripts/perf/cold-start.script.ts`
- **Gate**: type
- acceptance:
  - "Mide cold startup, module count, memory y bundle size (CORE-003)."
  - "CHECK-005: la división se decide con datos, no por dogma."

### S3 — Extraer @mcp-vertex/plugin-sdk
- **Status**: done
- **Files**: `packages/core/src/lib/plugins/plugin-contract.ts`
- **Gate**: type
- acceptance:
  - "El contrato de plugin se extrae a un SDK mínimo con dependencias solo MCP SDK + Zod (CORE-004)."

## acceptance

- Documenta qué es core (invariantes runtime) y qué no (authoring/setup/analyzer).
- CORE-002 resuelto con una definición explícita.
- Mide cold startup, module count, memory y bundle size (CORE-003).
- CHECK-005: la división se decide con datos, no por dogma.
- El contrato de plugin se extrae a un SDK mínimo con dependencias solo MCP SDK + Zod (CORE-004).
