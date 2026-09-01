---
id: r00033
title: "Envelopes compartidos (EntityRef, OperationResult, …)"
kind: refactor
status: ready
type: proposal
track: contracts
date: 2026-08-25
priority: P2
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track M / r00033"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
related:
    - q00006
    - r00029 # extraer @mcp-vertex/contracts (los envelopes van aquí)
    - f00198 # activation KPIs (consume envelopes)
    - f00199 # tool confusion rate (consume envelopes)
---

# r00033 — Envelopes compartidos (EntityRef, OperationResult, …)

## Goal

Definir un conjunto de **envelopes compartidos** en
`@mcp-vertex/contracts` que estandaricen la forma en que los plugins
y el core devuelven resultados al LLM: `EntityRef`,
`OperationResult`, `PagedResult`, `MutationResult`,
`DiagnosticResult`, `ResourceResult`.

### Comportamiento actual

- Cada plugin define sus propios tipos de retorno ad-hoc.
- El LLM recibe resultados con shapes inconsistentes: a veces
  `{ data: ... }`, a veces `{ items: [...] }`, a veces
  `{ ok: boolean, value: ... }`.
- El parseo downstream (en el LLM y en scripts) tiene que conocer
  cada shape.
- La auditoría externa (§46) lo marca como deuda: dificulta la
  reutilización y la explicabilidad.

### Comportamiento deseado

- `packages/contracts/src/envelopes.ts`:
  ```ts
  interface EntityRef<TKind extends string, TId extends string = string> {
    kind: TKind;          // 'proposal', 'plugin', 'slice', 'tool'…
    id: TId;
    href?: string;        // opcional, formato vertex://…
    displayName?: string; // humano-legible
  }
  interface OperationResult<T = unknown, E = Refusal> {
    ok: boolean;
    value?: T;
    error?: E;
    envelope?: EnvelopeMeta;
  }
  interface PagedResult<T> {
    items: T[];
    total: number;
    cursor?: string;
    pageSize: number;
  }
  interface MutationResult<T> {
    changed: EntityRef;
    before?: T;
    after?: T;
    dryRun?: boolean;
  }
  interface DiagnosticResult {
    severity: 'info' | 'warn' | 'error' | 'fatal';
    code: string;
    message: string;
    source: string;       // pluginId o 'core'
  }
  interface ResourceResult {
    uri: string;
    mime: string;
    content: string | Uint8Array;
  }
  ```
- Migración gradual: los plugins empiezan a devolver estos envelopes
  en lugar de shapes ad-hoc.

## why

- Cierra §46 de la auditoría.
- Reduce el coste del LLM al recibir resultados consistentes.
- Habilita UI declarativas (un solo renderer entiende todos los
  resultados).
- Es base para `f00198` / `f00199` (KPIs cross-plugin).

## non-goals

- No rompe la API actual de plugins existentes; la migración es
  gradual.
- No cambia el protocolo MCP底层 (resources, tools, prompts) — solo
  los shapes que viven *dentro* del envelope MCP.
- No es un sistema de versionado de envelopes (eso es `f00194`).

## architecture

### 1. Definición en `@mcp-vertex/contracts`

- `packages/contracts/src/envelopes.ts` (nuevo, parte de `r00029`).
- Los tipos son puros, sin imports de Node.

### 2. Adopción gradual

- Por cada plugin, identificar los returns ad-hoc y mapearlos a
  envelopes.
- Plugin piloto: `proposals` (Track M, ya usa OperationResult).
- Otros plugins siguen con sus shapes hasta que su slice natural
  lo justifique.

### 3. Tests

- `packages/contracts/tests/src/envelopes.spec.ts`:
  - Constructores válidos.
  - Narrowing correcto (`OperationResult.success` vs `.failure`).

### 4. Documentación

- `docs/mcp-vertex/ENVELOPES.md` (nuevo): cada envelope con
  ejemplo de uso y casos de uso.

## Slices

### S1 — Envelopes en contracts + adopción en proposals + docs

- **Status**: done
- **Files**: `packages/contracts/src/envelopes.ts`, `packages/contracts/tests/src/envelopes.spec.ts`, `plugins/proposals/src/lib/returns.ts` (migración ejemplo), `docs/mcp-vertex/ENVELOPES.md`
- **Gate**: type
- review-state: done
- review-implementer: copilot-orchestrator-r00033-s1
- review-reviewer: delivery-verifier-r00033-s1
- review-log: approved by delivery-verifier-r00033-s1 — Verified independently: r00033 S1 acceptance covered. Envelopes exist in @mcp-vertex/contracts (IToolOkEnvelope, IToolErrorEnvelope, IToolEnvelope, ICheckpointAdvisory, ICheckpointAdvisoryEnvelope). 5/5 envelope tests pass. typecheck green.
## acceptance

- Envelopes definidos y exportados.
- Plugin proposals usa al menos `OperationResult`.
- Tests verdes.
- Doc `ENVELOPES.md` con ejemplos.
- Otros plugins no se rompen.
