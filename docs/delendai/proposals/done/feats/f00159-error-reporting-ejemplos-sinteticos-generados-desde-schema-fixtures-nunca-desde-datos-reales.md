---
id: f00159
title: "error-reporting: ejemplos sintéticos generados desde schema/fixtures (nunca desde datos reales)"
kind: feat
status: done
type: proposal
track: privacy
date: 2026-08-24
shipped-in:
  - 37a63672 # chore(proposals): mover 17 propuestas completadas a review
  - a1e938a7 # feat(error-reporting): f00159 — ejemplos sintéticos desde schema/fixtures
---

# f00159 — error-reporting: ejemplos sintéticos generados desde schema/fixtures (nunca desde datos reales)

## Goal

Si una issue necesita un ejemplo completo para reproducir el fallo, **no publicar el ejemplo real**: generar un caso sintético que preserve la forma del fallo pero cambie por completo la idea de negocio.

Parte del plan `q00003`. Referencias legadas (`docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md`):

- §2 ER-005 — sustitución por ejemplos sintéticos
- §31 PRIV-001..005 — librería de fixtures, dominios reservados, IDs sintéticos

Diseño:

- `schema + internal failure point → synthetic payload` (nunca `real payload → replace strings`).
- Fixtures de dominios ficticios: bakery, weather, books, pets, music catalog, fictional inventory.
- Dominios reservados `example.invalid` / `example.com`.
- IDs sintéticos inequívocos: `EXAMPLE-001`, `DEMO-123`, `SYNTHETIC-42`.
- No preservar longitudes ni hashes si pueden filtrar.

**Principio:** sanitizar es segunda línea de defensa; la primera es no usar el dato real.

## why

Redactar parcialmente un valor real (p. ej. un JSON de facturación) aún puede filtrar estructura, longitudes y nombres. Generar desde schema/fixtures elimina esa superficie por completo y mantiene la utilidad diagnóstica de la issue.

## non-goals

- No reconstruir el ejemplo desde los datos reales en ningún paso.
- No inventar dominios plausibles de empresas reales.
- No incluir el ejemplo sintético si el DTO ya es suficiente para diagnosticar.

## Slices

- global_gate: type

### S1 — Librería de fixtures sintéticas
- **Status**: done
- **Files**: `plugins/error-reporting/src/lib/synthetic-fixtures.constant.ts`
- **Gate**: type
- acceptance:
  - "Cubre bakery/weather/books/pets/music catalog/fictional inventory."
  - "Usa solo dominios reservados example.invalid / example.com."
  - "IDs EXAMPLE-001 / DEMO-123 / SYNTHETIC-42."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Fase 1 review 2026-08-25: validate verde.
### S2 — Builder de reproducción sintética desde schema
- **Status**: done
- **Files**: `plugins/error-reporting/src/lib/synthetic-example.builder.ts`
- **Gate**: type
- acceptance:
  - "Genera el ejemplo desde schema de tool + tipo del argumento + error code + fixture genérica."
  - "Nunca parte del payload real."
  - "El builder no recibe args reales como entrada."

## acceptance

- Cubre bakery/weather/books/pets/music catalog/fictional inventory.
- Usa solo dominios reservados example.invalid / example.com.
- IDs EXAMPLE-001 / DEMO-123 / SYNTHETIC-42.
- Genera el ejemplo desde schema de tool + tipo del argumento + error code + fixture genérica.
- Nunca parte del payload real.
- El builder no recibe args reales como entrada.
