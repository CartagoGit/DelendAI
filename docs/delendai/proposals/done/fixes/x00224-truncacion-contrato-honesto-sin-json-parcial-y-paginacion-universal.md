---
id: x00224
title: "truncación: contrato honesto, sin JSON parcial y paginación universal"
kind: fix
status: done
type: proposal
track: metrics
date: 2026-08-24
---

# x00224 — truncación: contrato honesto, sin JSON parcial y paginación universal

## Goal

Hacer honesto el contrato de truncación y sustituir el truncado destructivo por **paginación/cursor** y estructuras reales.

Parte del plan `q00003`. Referencias legadas (`docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md`):

- §8 OUT-001 — manejar `maxBytes` menor que el envelope mínimo (nunca afirmar `finalBytes <= maxBytes` si no se cumple)
- §8 OUT-002 — evitar algoritmo decremental byte a byte (búsqueda binaria/overhead/buffers)
- §8 OUT-003 — no meter JSON serializado parcialmente en `head`
- §8 OUT-004 — paginación universal `{ items, page: { cursor, nextCursor, hasMore } }`
- §8 OUT-005 — reducir default global de 256 KiB (general compact 4–8 KiB, search/docs/logs 8–16 KiB, ceiling 64 KiB)
- §28 CHECK-006 — validar si el default 256 KiB ha sido necesario en casos reales

Para arrays: `{ items, truncated, nextCursor }`. Para archivos: excerpt con ranges. Para datasets grandes: resource URI.

## why

El truncador promete `finalBytes <= maxBytes` en un caso donde no puede cumplirlo, degrada a un algoritmo caro y mete fragmentos de JSON en `head`. La paginación con cursor es más eficiente en tokens y preserva estructura en lugar de cortarla.

## non-goals

- No imponer números definitivos de límites sin benchmark (CHECK-006 primero).
- No reescribir todas las tools en esta propuesta (se define el contrato y se migran las principales).
- No eliminar el modo 'full' explícito.

## Slices

- global_gate: type

### S1 — Contrato de truncación honesto y eficiente
- **Status**: done
- **Files**: `packages/core/src/lib/shared/tool-response.ts`
- **Gate**: type
- acceptance:
  - "finalBytes <= maxBytes o error/clamp explícito (nunca una promesa falsa)."
  - "Truncación con búsqueda binaria/overhead, no decremento byte a byte."
  - "No se inyecta JSON parcial en head."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Fase 1 review 2026-08-25: truncation-pagination.spec.ts revisado; validate verde.
### S2 — Paginación universal y reducción del default
- **Status**: done
- **Files**: `packages/core/src/lib/shared/pagination.helper.ts`
- **Gate**: type
- acceptance:
  - "Contrato { items, page:{ cursor, nextCursor, hasMore } } reutilizable."
  - "Default general reducido (compact 4–8 KiB) con ceiling explícito de 64 KiB."

### S3 — Tests de límites y paginación
- **Status**: done
- **Files**: `packages/core/tests/src/lib/shared/truncation-pagination.spec.ts`
- **Gate**: type
- acceptance:
  - "Cubre maxBytes < envelope mínimo, truncación multibyte y paginación con cursor."

## acceptance

- finalBytes <= maxBytes o error/clamp explícito (nunca una promesa falsa).
- Truncación con búsqueda binaria/overhead, no decremento byte a byte.
- No se inyecta JSON parcial en head.
- Contrato { items, page:{ cursor, nextCursor, hasMore } } reutilizable.
- Default general reducido (compact 4–8 KiB) con ceiling explícito de 64 KiB.
- Cubre maxBytes < envelope mínimo, truncación multibyte y paginación con cursor.
