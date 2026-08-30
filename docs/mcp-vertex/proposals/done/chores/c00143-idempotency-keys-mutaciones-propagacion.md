---
id: c00143
title: "Idempotency keys para mutaciones (propagación)"
kind: chore
status: done
type: proposal
track: architecture
date: 2026-08-25
priority: P2
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
shipped-in:
    - f5836e9 # S1 helper withIdempotency + instrumentación commit-policy + tests
    section: "Track N / c00143"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
related:
    - q00006
    - f00182 # commit policy engine (predecesor de idempotency en commits)
    - f00183 # idempotency keys commits automaticos (Track B)
    - f00201 # workflow transactions (Track O)
---

# c00143 — Idempotency keys para mutaciones (propagación)

## Goal

Propagar **`idempotencyKey`** consistentemente a través de todas las
mutaciones críticas del sistema: `git.commit`, `git.push`,
`issues.create`, `commit-policy.run`, `proposals.close`, etc. Una
misma `idempotencyKey` ejecutada dos veces produce el mismo
resultado sin side effects duplicados.

### Comportamiento actual

- Algunas tools aceptan `idempotencyKey` ad-hoc; otras no.
- El LLM puede invocar la misma mutación dos veces (por error o
  retry) y producir duplicados.
- La auditoría externa (§54) lo marca como gap: no hay garantía
  de idempotencia cross-tool.

### Comportamiento deseado

- Schema estándar:
  ```ts
  interface MutationArgs {
    /* … args específicos … */
    idempotencyKey?: string;  // UUIDv4 o equivalente
  }
  ```
- Cada mutación crítica:
  - Si recibe `idempotencyKey`, persiste el resultado
    (`commit-hash`, `pr-url`, `issue-id`, etc.) en una store local
    (`.vscode/mcp-vertex/idempotency.json`).
  - Si recibe la misma `idempotencyKey` dos veces, devuelve el
    resultado cacheado sin re-ejecutar.
- TTL configurable (default 24h).
- Métrica: `mutation.duplicate_suppressed` counter.

## why

- Cierra §54 de la auditoría.
- Da al LLM confianza para hacer retry sin miedo a duplicar.
- Habilita `f00201` (workflow transactions): una transacción
  re-ejecutable usa la misma key.
- Es base para tests reproducibles.

## non-goals

- No implementa un servicio externo de idempotencia (es local).
- No cambia la API de tools existentes que ya tienen
  `idempotencyKey` (solo estandariza).
- No rompe retries del cliente HTTP; es una capa por encima.

## architecture

### 1. Helper

- `packages/core/src/lib/mutations/idempotency.ts`:
  - `withIdempotency<T>(key, fn): Promise<T>`.
  - Cachea por key en `.vscode/mcp-vertex/idempotency.json`.
  - Si la key existe, devuelve el resultado cacheado.

### 2. Mutaciones a instrumentar

- `plugins/commit-policy/src/lib/engine.ts` (commit_run).
- `plugins/git/src/lib/operations.ts` (commit, push).
- `plugins/issues/src/lib/create.ts` (issue_create).
- `plugins/proposals/src/lib/close.ts` (proposal_close).
- Cualquier otra tool con `effects: ['write']`.

### 3. Privacidad

- El cache solo guarda el resultado (output serializable), no los
  inputs que puedan contener datos privados.
- Sin sync a sink externo (R1.9).

### 4. Tests

- `packages/core/tests/src/lib/mutations/idempotency.spec.ts`:
  - Misma key → mismo resultado, sin re-ejecución.
  - Keys distintas → ejecuciones independientes.
  - TTL expirado → re-ejecuta.

## Slices

### S1 — Helper + instrumentación de mutaciones críticas + tests

- **Status**: done
- **Files**: `packages/core/src/lib/mutations/idempotency.ts`, `plugins/{commit-policy,git,issues,proposals}/src/lib/**/*.ts` (instrumentación), `packages/core/tests/src/lib/mutations/idempotency.spec.ts`
- **Gate**: type
- review-state: done
- review-implementer: implementation_runner
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificado: idempotency.spec 21/21 verde (misma key sin re-ejecución, keys distintas independientes, TTL/prune), typecheck core limpio, uso en commit-policy. Contrato del slice cumplido.
## acceptance

- Helper `withIdempotency` exportado.
- Mutaciones críticas lo usan.
- Cache local en `.vscode/mcp-vertex/idempotency.json`.
- Tests verdes.
- Sin sink externo.
- `bun run validate` verde.
