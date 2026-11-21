---
id: x00228
title: "client: versión inyectada, payload validation opcional y errores de transporte"
kind: fix
status: done
type: proposal
track: core
date: 2026-08-24
---

# x00228 — client: versión inyectada, payload validation opcional y errores de transporte

## Goal

Corregir el cliente TS: eliminar la versión hardcoded, ofrecer validación opcional de payload en runtime y clasificar mejor los errores de transporte.

Parte del plan `q00003`. Referencias legadas (`docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md`):

- §16 CLIEN-001 — eliminar versión hardcoded (anuncia 0.1.0 con paquete 0.1.1)
- §16 CLIEN-002 — runtime payload validation opcional (`request(tool, args, outputSchema)`)
- §16 CLIEN-003 — clasificar transport errors (timeout, cancellation, invalid payload, protocol, tool error, server exit)
- §26 REL-004 — version injection (no hardcodear versiones en runtime/client/plugins)

La versión debe generarse desde el metadata del package en build.

## why

Una versión hardcoded en el anuncio del client es un bug menor pero sintomático de no derivar del build. La validación opcional de payload y la clasificación de errores de transporte hacen el client más fiable para consumidores.

## non-goals

- No cambiar la API pública del client (solo añadir opciones).
- No romper la compatibilidad con el SDK MCP actual.
- No tocar los servicios de dominio del client.

## Slices

- global_gate: type

### S1 — Versión inyectada desde package metadata
- **Status**: done
- **Files**: `packages/client/src/index.ts`
- **Gate**: type
- acceptance:
  - "La versión anunciada se genera desde package metadata (CLIEN-001, REL-004)."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Fase 1 review 2026-08-25: regresión de mensaje corregida + tests nuevos; validate verde.
### S2 — Payload validation opcional y errores de transporte
- **Status**: done
- **Files**: `packages/client/src/lib/transport/mcp-stdio-client.ts`
- **Gate**: type
- acceptance:
  - "request(tool, args, outputSchema?) valida el payload con Zod cuando se pasa schema (CLIEN-002)."
  - "Se clasifican timeout/cancellation/invalid payload/protocol/tool error/server exit (CLIEN-003)."

## acceptance

- La versión anunciada se genera desde package metadata (CLIEN-001, REL-004).
- request(tool, args, outputSchema?) valida el payload con Zod cuando se pasa schema (CLIEN-002).
- Se clasifican timeout/cancellation/invalid payload/protocol/tool error/server exit (CLIEN-003).
