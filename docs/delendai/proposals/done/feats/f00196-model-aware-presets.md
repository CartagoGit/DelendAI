---
id: f00196
title: "Model-aware presets"
kind: feat
status: done
type: proposal
track: routing
date: 2026-08-25
priority: P2
parent-plan: q00006
shipped-in:
  - 72d967d6
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track L / f00196"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
related:
    - q00006
    - f00195 # cost-aware routing (consume modelProfiles)
    - c00135 # token efficiency (Track E, sinergia)
---

# f00196 — Model-aware presets

## Goal

Introducir **`modelProfiles`** en el sistema de presets: cada
perfil (`small`, `medium`, `large`) declara un
`maxInitialToolTokens` distinto, de modo que el catálogo de tools
expuesto al LLM se adapte al modelo en uso.

### Comportamiento actual

- Existe un sistema de presets (`small/medium/large/native`) pero
  no declara explícitamente `maxInitialToolTokens` por perfil.
- El catálogo se filtra solo por `staticBytes` global.
- La auditoría externa (§41) lo marca como gap: un modelo `small`
  recibe el mismo catálogo que un `large`, desperdiciando tokens
  o rompiendo el contexto.

### Comportamiento deseado

- `packages/core/src/lib/presets/model-profiles.ts`:
  ```ts
  interface ModelProfile {
    id: 'small' | 'medium' | 'large' | string;
    maxInitialToolTokens: number;   // ej. 4000, 8000, 16000
    maxToolSurfaceBytes: number;    // ej. 5000, 12000, 30000
    routing: UtilityWeights;        // ver f00195
  }
  const modelProfiles: Record<string, ModelProfile> = {
    small:  { maxInitialToolTokens: 4000,  maxToolSurfaceBytes: 5000,
              routing: { lambda: 0.5, mu: 0.3, nu: 0.2 } },
    medium: { maxInitialToolTokens: 8000,  maxToolSurfaceBytes: 12000,
              routing: { lambda: 0.3, mu: 0.4, nu: 0.3 } },
    large:  { maxInitialToolTokens: 16000, maxToolSurfaceBytes: 30000,
              routing: { lambda: 0.2, mu: 0.5, nu: 0.3 } },
  };
  ```
- El sistema de presets consume `modelProfiles` para decidir qué
  tools se exponen al boot.
- Auto-detección del modelo: si el cliente no declara perfil, lo
  infiere de un header del provider.

## why

- Cierra §41 de la auditoría.
- Habilita uso eficiente de modelos `small` (no se les inunda con
  tools que no pueden razonar bien).
- Da a cada perfil sus pesos de routing (sinergia con `f00195`).
- Reduce coste real de tokens para usuarios de modelos baratos.

## non-goals

- No reemplaza al sistema de presets existente; lo extiende.
- No introduce auto-tuning de los perfiles (los valores son
  declarados, no aprendidos).
- No rompe el preset `native` (que ya tiene su propio shape).

## architecture

### 1. Módulo

- `packages/core/src/lib/presets/model-profiles.ts`:
  - Define `ModelProfile` y el catálogo por defecto.
  - `getModelProfile(id)`, `listModelProfiles()`.

### 2. Integración

- `packages/core/src/lib/presets/select.ts` (o equivalente):
  - Cuando se selecciona un preset, resuelve el `ModelProfile`
    correspondiente.
- El router filtra tools cuyo `staticBytes` acumulado no exceda
  `maxInitialToolTokens`.

### 3. Auto-detección

- `packages/client/src/services/model-detector.ts`:
  - Si el provider envía un header `x-model-tier`, mapea a
    `ModelProfile`.
  - Si no, usa `medium` por defecto.

### 4. Tests

- `packages/core/tests/src/lib/presets/model-profiles.spec.ts`:
  - Cada perfil tiene sus valores.
  - Selección automática por tier.
  - Filtro de tools por `maxInitialToolTokens`.

## Slices

### S1 — Model profiles + integración con presets + auto-detección

- **Status**: done
- **Files**: `packages/core/src/lib/presets/model-profiles.ts`, `packages/core/src/lib/presets/select.ts`, `packages/client/src/services/model-detector.ts`, `packages/core/tests/src/lib/presets/model-profiles.spec.ts`
- **Gate**: type
- review-state: done
- review-implementer: implementation_runner
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificación independiente: suite de model profiles 18/18, typecheck de packages/core y packages/client en verde, y Biome limpio. La selección de perfil y detección de header están integradas sin I/O ni cambios incompatibles.
## acceptance

- Perfiles `small/medium/large` con valores razonables.
- Auto-detección funciona cuando el provider lo soporta.
- Filtro de tools respeta `maxInitialToolTokens`.
- Tests verdes.
- `bun run validate` verde.
