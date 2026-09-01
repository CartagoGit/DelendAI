---
id: x00229
title: "MCP: metadata inyectada vs outputSchema y envolvente _meta universal"
kind: fix
status: done
type: proposal
track: memory-mcp
date: 2026-08-24
---

# x00229 — MCP: metadata inyectada vs outputSchema y envolvente _meta universal

## Goal

Auditar la interacción entre la metadata inyectada tras ejecutar una tool y su `outputSchema`, y mover la metadata transversal a un canal que no viole el contrato.

Parte del plan `q00003`. Referencias legadas (`docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md`):

- §15 MCP-001 — revisar inyección posterior de metadata (`logHint`, `checkpoint`, `__stuck_detected`, `handoffPath`) vs `outputSchema`
- §15 MCP-002 — envelope/meta universal (`_meta` o envolvente `{ data, meta }`)
- §15 MCP-003 — compatibility tests contra varias versiones/clientes MCP
- §28 CHECK-001 — ¿puede la metadata inyectada violar `outputSchema`?

Trabajo: inventariar todas las tools con `outputSchema`, ejecutarlas con cada advisory posible, validar el resultado final contra el schema, y comprobar el comportamiento del SDK y clientes. La metadata transversal debe ir a `_meta` (canal MCP no validado) o a una envolvente generada.

## why

Si una tool con `outputSchema` estricto recibe propiedades ajenas (advisories) en `structuredContent`, el resultado puede quedar fuera de schema y el cliente MCP rechazarlo. La metadata transversal debe vivir en un canal que no compita con el contrato de datos.

## non-goals

- No eliminar los advisories (se reubican, no se quitan).
- No romper la compatibilidad del structuredContent para clientes legacy.
- No cambiar el contrato MCP aplicable.

## Slices

- global_gate: type

### S1 — Inventario y validación de metadata vs outputSchema
- **Status**: done
- **Files**: `packages/core/src/lib/shared/tool-response.ts`
- **Gate**: type
- acceptance:
  - "CHECK-001: se inventarían tools con outputSchema y se valida que la metadata inyectada no viola el schema."
  - "La metadata transversal se reubica en _meta o envolvente { data, meta } (MCP-002)."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Fase 1 review 2026-08-25: validate verde.
### S2 — Compatibilidad MCP multi-cliente
- **Status**: done
- **Files**: `packages/core/tests/src/lib/shared/meta-envelope.spec.ts`
- **Gate**: type
- acceptance:
  - "Matriz SDK server/client + host VS Code + clientes principales (MCP-003)."
  - "El structuredContent respeta outputSchema con y sin advisory."

## acceptance

- CHECK-001: se inventarían tools con outputSchema y se valida que la metadata inyectada no viola el schema.
- La metadata transversal se reubica en _meta o envolvente { data, meta } (MCP-002).
- Matriz SDK server/client + host VS Code + clientes principales (MCP-003).
- El structuredContent respeta outputSchema con y sin advisory.
