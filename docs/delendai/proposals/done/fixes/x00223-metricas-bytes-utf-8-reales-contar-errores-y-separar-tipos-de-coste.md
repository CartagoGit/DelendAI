---
id: x00223
title: "métricas: bytes UTF-8 reales, contar errores y separar tipos de coste"
kind: fix
status: done
type: proposal
track: metrics
date: 2026-08-24
---

# x00223 — métricas: bytes UTF-8 reales, contar errores y separar tipos de coste

## Goal

Corregir la medición de bytes en métricas y el tratamiento de respuestas de error.

Parte del plan `q00003`. Referencias legadas (`docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md`):

- §7 MET-001 — `estimateResultBytes` debe usar `Buffer.byteLength(text, 'utf8')`
- §7 MET-002 — las respuestas de error NO son coste cero
- §7 MET-003 — separar tipos de coste (`ToolCost` con contentTextBytes/structuredJsonBytes/wireEstimateBytes/estimatedTokens)
- §7 MET-004 — nomenclatura canónica de token estimate (`estimatedTokens4B` vs `actualModelTokens`)
- §7 MET-005 — agregados sin datos privados (nunca paths/queries/args/outputs)

Hoy `estimateResultBytes` usa `text.length` (UTF-16) y el wrapper pone `bytes: isError ? 0 : ...`, contaminando usage-tracking y análisis de coste.

## why

Dos definiciones distintas de "byte" conviven hoy (los tests de presupuestos usan Buffer.byteLength, las métricas usan string.length), y los errores cuestan oficialmente 0 bytes. Todo experimento de coste/tokens futuro se construye sobre estas métricas: si son falsas, las conclusiones también.

## non-goals

- No cambiar la heurística 4B/token (se mantiene pero se etiqueta como estimada).
- No persistir datos privados en agregados (invariante).
- No reescribir usage-tracking aquí (se beneficia, no se migra).

## Slices

- global_gate: type

### S1 — Bytes UTF-8 reales y errores contados
- **Status**: done
- **Files**: `packages/core/src/lib/metrics/metrics-registry.ts`
- **Gate**: type
- acceptance:
  - "estimateResultBytes usa Buffer.byteLength(text,'utf8')."
  - "Las respuestas de error se miden (nunca 0 por defecto)."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Fase 1 review 2026-08-25: validate verde.
### S2 — Tipos de coste y nomenclatura de tokens
- **Status**: done
- **Files**: `packages/core/src/lib/metrics/metrics-tool.ts`
- **Gate**: type
- acceptance:
  - "ToolCost separa contentTextBytes/structuredJsonBytes/wireEstimateBytes/estimatedTokens."
  - "Se distingue estimatedTokens4B de actualModelTokens."

### S3 — Tests de medición
- **Status**: done
- **Files**: `packages/core/tests/src/lib/metrics/bytes-and-errors.spec.ts`
- **Gate**: type
- acceptance:
  - "Strings con emoji/acentos/japonés se miden en bytes UTF-8 correctos."
  - "Un error incrementa bytes (no 0)."
  - "Agregados no contienen paths/queries/args/outputs."

## acceptance

- estimateResultBytes usa Buffer.byteLength(text,'utf8').
- Las respuestas de error se miden (nunca 0 por defecto).
- ToolCost separa contentTextBytes/structuredJsonBytes/wireEstimateBytes/estimatedTokens.
- Se distingue estimatedTokens4B de actualModelTokens.
- Strings con emoji/acentos/japonés se miden en bytes UTF-8 correctos.
- Un error incrementa bytes (no 0).
- Agregados no contienen paths/queries/args/outputs.
