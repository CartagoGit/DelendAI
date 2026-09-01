---
id: f00201
title: "Workflow transactions: plan / execute / compensate"
kind: feat
status: ready
type: proposal
track: transactions
date: 2026-08-25
priority: P3
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track O / f00201"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
related:
    - q00006
    - c00143 # idempotency keys (sinergia para retries)
    - f00189 # dryRun transversal (transacciones usan dryRun primero)
---

# f00201 — Workflow transactions: plan / execute / compensate

## Goal

Introducir un sistema de **transacciones workflow**:
`vertex_transaction` con compensación declarativa. Un workflow
declarado como `plan([stepA, stepB, stepC])` se ejecuta; si C
falla, se compensan B y A en orden inverso.

### Comportamiento actual

- No hay abstracción de "transacción workflow" en el host.
- Las mutaciones se ejecutan individualmente; un fallo a mitad de
  camino deja el sistema en estado inconsistente.
- La auditoría externa (§55) lo marca como feature pendiente para
  flujos compuestos (commit + push + crear PR, etc.).

### Comportamiento deseado

- `packages/core/src/lib/transactions/**`:
  ```ts
  interface Step<T> {
    name: string;
    effects: Capability[];
    compensable: boolean;
    run: (ctx: StepContext) => Promise<T>;
    compensate?: (ctx: CompensationContext, prior: T) => Promise<void>;
  }
  async function plan<T>(steps: Step<T>[]): Promise<TransactionResult<T[]>>;
  ```
- Ejecución:
  1. `plan([...])` devuelve un descriptor (sin side effects).
  2. `execute(plan, { dryRun: true })` muestra qué haría.
  3. `execute(plan, { dryRun: false })` corre los steps.
  4. Si un step falla:
     - Para cada step ejecutado en orden inverso, llama a
       `compensate(...)` si está definido.
     - Si un compensate falla, registra el error y continúa con
       el siguiente.
- Cada step declara `effects` para que `f00189` (dryRun) pueda
  razonar sobre el riesgo.

## why

- Cierra §55 de la auditoría.
- Da al usuario garantías de "todo o nada" en flujos compuestos.
- Habilita retries seguros (combinado con `c00143`).
- Es la base para flujos avanzados (release, deploy, etc.).

## non-goals

- No implementa transacciones distribuidas (es single-process).
- No implementa 2PC ni saga complejo; es linear compensation.
- No es un workflow engine completo (no hay branches, parallel,
  etc. en esta iteración).
- No ejecuta steps reales en los tests; solo steps sintéticos.

## architecture

### 1. Módulo

- `packages/core/src/lib/transactions/plan.ts`:
  - Tipo `Step<T>`, `TransactionResult<T>`.
  - Función `plan(steps)`.
  - Función `execute(plan, options)`.
- `packages/core/src/lib/transactions/compensate.ts`:
  - Lógica de compensación en orden inverso.

### 2. Tests con steps sintéticos

- `packages/core/tests/src/lib/transactions/plan.spec.ts`:
  - Tres steps sintéticos (sin side effects reales): un contador
    se incrementa en cada step.
  - Si el step 3 falla, se compensan 1 y 2; el contador vuelve a
    0.
- `packages/core/tests/src/lib/transactions/dry-run.spec.ts`:
  - `dryRun: true` no ejecuta side effects.

### 3. Ejemplo de uso (no se ejecuta)

- Workflow típico: `commit → push → create PR`.
- Si `create PR` falla, se compensan `push` (no se puede deshacer
  un push, pero se documenta) y `commit` (`git reset --soft`).

### 4. Privacidad

- Sin sinks externos.
- Logs solo IDs y conteos.

## Slices

### S1 — Módulo de transacciones + tests con steps sintéticos

- **Status**: done
- **Files**: `packages/core/src/lib/transactions/{plan,compensate,types}.ts`, `packages/core/tests/src/lib/transactions/{plan,dry-run}.spec.ts`
- **Gate**: type
- review-state: done
- review-implementer: Cartago
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Revisión independiente: el plan/execute/compensate transaccional y el dry-run están cubiertos por 27/27 tests focalizados; el typecheck de packages/core pasa con salida 0.
## acceptance

- `plan()` y `execute()` con compensación funcionan.
- DryRun respeta `dryRun: true`.
- Tests verdes con steps sintéticos.
- Documentación con ejemplo de uso.
- Sin side effects reales en tests.
