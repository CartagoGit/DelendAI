---
id: f00195
title: "Cost-aware routing utility"
kind: feat
status: done
type: proposal
track: routing
date: 2026-08-25
priority: P2
parent-plan: q00006
shipped-in:
  - af2be9ae
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track L / f00195"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
related:
    - q00006
    - f00193 # external MCPs (consume la utility)
    - f00194 # capability versioning (input a la utility)
    - f00196 # model-aware presets (sinergia)
---

# f00195 — Cost-aware routing utility

## Goal

Introducir una **utility function** que el router del cliente
(`f00193`) usa para decidir qué provider / modelo usar para una
tool, basándose en una fórmula explícita:
`utility = quality - tokenCost*λ - latency*μ - securityRisk*ν`.

### Comportamiento actual

- El router del cliente elige el primer provider disponible, sin
  razonamiento de coste.
- No hay forma declarativa de decir "prefiero calidad sobre
  latencia" o "no quiero gastar más de N tokens en este paso".
- La auditoría externa (§40) lo marca como gap.

### Comportamiento deseado

- `packages/core/src/lib/routing/utility.ts`:
  ```ts
  interface UtilityWeights {
    lambda: number;   // peso del coste de tokens
    mu: number;       // peso de la latencia
    nu: number;       // peso del riesgo de seguridad
  }
  function utility(
    candidate: ProviderCandidate,
    weights: UtilityWeights,
    context: RoutingContext,
  ): number;
  ```
- Inputs normalizados (0..1) para que la suma sea comparable.
- El router (`f00193`) usa `utility(...)` para rankear candidatos y
  elegir el mejor.
- Configuración por usuario: `mcp-vertex.config.json` admite
  `routing.weights`.
- Documentado: valores por defecto razonables y cómo ajustarlos.

## why

- Cierra §40 de la auditoría.
- Da al usuario control sobre el trade-off calidad/coste/latencia.
- Habilita `f00196` (model-aware presets) que ajusta los pesos por
  preset.
- Permite que el LLM sea consciente de los pesos para evitar
  selecciones caras.

## non-goals

- No implementa un bandit / RL; es una utility determinista.
- No aprende de feedback (eso es scope futuro).
- No negocia con proveedores externos en runtime.
- No sustituye al `f00194` (versioning); solo decide entre
  candidatos válidos.

## architecture

### 1. Función pura

- `packages/core/src/lib/routing/utility.ts`:
  - Recibe `ProviderCandidate` (con `quality`, `tokenCost`,
    `latencyMs`, `securityRisk`).
  - Recibe `UtilityWeights`.
  - Devuelve `number` (mayor = mejor).
- Sin I/O; pura.

### 2. Normalización

- `tokenCost` se normaliza por `maxTokenCost` observado.
- `latencyMs` se normaliza por `maxLatencyMs` observado.
- `securityRisk` viene pre-normalizado (0..1) desde el manifest del
  provider.

### 3. Integración

- `packages/client/src/services/external-mcp/router.ts` (`f00193`):
  - Llama a `utility(...)` sobre cada candidato.
  - Selecciona el de mayor score.

### 4. Tests

- `packages/core/tests/src/lib/routing/utility.spec.ts`:
  - Datos sintéticos (R1.4) — domains bakery/books/pets.
  - Verifica que un provider con mejor calidad gana si los pesos lo
    favorecen.
  - Verifica que provider con menor coste gana cuando `λ` es alto.

## Slices

### S1 — Utility function + integración con router + tests

- **Status**: done
- **Files**: `packages/core/src/lib/routing/utility.ts`, `packages/client/src/services/external-mcp/router.ts`, `packages/core/tests/src/lib/routing/utility.spec.ts`, `mcp-vertex.config.json` schema
- **Gate**: type
- review-state: done
- review-implementer: implementation_runner
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificación independiente: utility pura y determinista, integración del router y tests sintéticos pasan 29/29; typechecks de core y client en verde. El ranking por coste/latencia/salud está cubierto.
## acceptance

- `utility(...)` es pura, determinista.
- Router la usa para rankear.
- Config permite ajustar pesos.
- Tests verdes con datos sintéticos.
- `bun run validate` verde.
