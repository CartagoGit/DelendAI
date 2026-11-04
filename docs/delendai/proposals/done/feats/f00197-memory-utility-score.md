---
id: f00197
title: "Memory utility score"
kind: feat
status: done
type: proposal
track: memory
date: 2026-08-25
priority: P2
parent-plan: q00006
shipped-in:
  - 1450cac8
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track M / f00197"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
related:
    - q00006
    - f00195 # cost-aware routing (mismo concepto de utility)
    - f00196 # model-aware presets (afecta el threshold)
    - v00124 # memory freshness event-driven (predecesor)
---

# f00197 — Memory utility score

## Goal

Introducir un **score de utilidad** para memorias: cada memoria
almacenada tiene un `utility = recency * α + similarity * β +
usage * γ - cost * δ`. Solo se inyectan en el contexto del LLM las
memorias cuyo `utility > costThreshold`.

### Comportamiento actual

- El sistema de memoria (`packages/core/src/lib/memory/`) recupera
  memorias por similitud de embedding.
- No hay razonamiento sobre coste ni sobre si la memoria es
  realmente útil para el LLM en este momento.
- La auditoría externa (§42) lo marca como gap: el LLM recibe
  memorias irrelevantes que ocupan contexto.

### Comportamiento deseado

- `packages/core/src/lib/memory/utility.ts`:
  ```ts
  interface MemoryUtilityWeights {
    alpha: number;  // peso de recencia
    beta: number;   // peso de similitud
    gamma: number;  // peso de uso previo
    delta: number;  // peso del coste (en bytes)
  }
  interface MemoryEntry {
    id: string;
    createdAt: number;
    lastUsedAt: number;
    usageCount: number;
    sizeBytes: number;
    similarity?: number;  // para el query actual
  }
  function utility(
    entry: MemoryEntry,
    weights: MemoryUtilityWeights,
    costThreshold: number,
  ): number;
  ```
- El sistema de retrieval (`packages/core/src/lib/memory/retrieve.ts`)
  filtra memorias con `utility < costThreshold` antes de inyectarlas
  en el contexto.
- Config: `mcp-vertex.config.json` admite `memory.utility.weights` y
  `memory.utility.costThreshold`.

## why

- Cierra §42 de la auditoría.
- Reduce el consumo de tokens al evitar memorias inútiles.
- Da al usuario control sobre el trade-off.
- Es coherente con `f00195` (utility para routing) — mismo patrón
  conceptual.

## non-goals

- No reemplaza al retrieval por similitud; lo complementa.
- No aprende pesos online.
- No cambia el formato de almacenamiento de memorias.
- No decide olvidar memorias (eso es scope futuro).

## architecture

### 1. Función pura

- `packages/core/src/lib/memory/utility.ts`:
  - Recibe entry + weights.
  - Normaliza cada componente a 0..1.
  - Devuelve score.

### 2. Integración

- `packages/core/src/lib/memory/retrieve.ts`:
  - Tras recuperar por similitud, aplica filtro `utility > threshold`.
  - Logs de memorias filtradas (para debugging).

### 3. Tests

- `packages/core/tests/src/lib/memory/utility.spec.ts`:
  - Datos sintéticos (R1.4).
  - Memoria muy reciente + muy similar + muy usada → utility alta.
  - Memoria vieja + poco similar → utility baja.
  - Memoria de gran tamaño penalizada por `δ`.

### 4. Privacidad

- Sin contenido de memorias en logs.
- Solo IDs y scores.

## Slices

### S1 — Utility function + integración con retrieve + tests

- **Status**: done
- **Files**: `packages/core/src/lib/memory/utility.ts`, `packages/core/src/lib/memory/retrieve.ts`, `packages/core/tests/src/lib/memory/utility.spec.ts`, `mcp-vertex.config.json` schema
- **Gate**: type
- review-state: done
- review-implementer: implementation_runner
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificación independiente: utility y retrieval pasan 14/14 tests, typecheck de packages/core y Biome están en verde. El filtro usa solo metadatos, aplica threshold y calcula el coste relativo al lote sin exponer contenido de memorias.
## acceptance

- `utility(...)` es pura, determinista.
- Retrieve filtra memorias con utility baja.
- Config admite ajustar pesos y threshold.
- Tests verdes.
- Sin contenido de memorias en logs.
