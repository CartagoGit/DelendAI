---
id: f00267
title: "AUD-CP-012/§54 — Idempotency keys para commits automáticos"
kind: feat
status: blocked
type: proposal
track: commit-policy
date: 2026-08-25
priority: P1
classification: CONFIRMADO
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track B / f00267"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
    finding: AUD-CP-012, §54
related:
    - q00006
    - f00266 # engine usa processedEvents internamente
    - t00021 # test de replay
---

# f00267 — Idempotency keys para commits automáticos

## Goal

Hoy el `CommitPolicyEngine.handle()` no tiene noción de
"evento ya procesado": un replay del mismo evento (por retry,
reentrega de `slice-listener`, accidente de orchestrator) ejecuta
el commit una segunda vez, dejando dos commits con el mismo
efecto lógico pero SHAs distintos. La auditoría externa lo llama
"AUD-CP-012, §54".

Tras la corrección:

1. Cada commit automático lleva un `idempotencyKey`
   calculable y reproducible:
   ```
   commit-policy:<proposalId>:<sliceId>:<eventId>
   ```
   Para triggers sin `eventId`: `commit-policy:<kind>:<triggerId>:<tsBucket>`.
2. Antes de stage+commit, el engine consulta `processedEvents`.
   Si la key existe → `EngineResult.ALREADY_PROCESSED` (sin
   commit).
3. Tras commit exitoso, la key se persiste en `processed-events.jsonl`
   bajo `withFileMutex`.
4. TTL configurable (default 30 días). Al expirar, la key puede
   re-procesarse (decisión política posterior).

### Comportamiento actual (BUG)

```
event v1 → engine.handle → commit #1
event v1 (replay) → engine.handle → commit #2 (mismo efecto lógico, sha distinto)
```

### Comportamiento deseado

```
event v1 → engine.handle → commit #1, key persisted
event v1 (replay) → engine.handle → ALREADY_PROCESSED, no commit
event v2 (nuevo) → engine.handle → commit #2
TTL expirado de v1 → engine.handle → permite re-procesar (configurable)
```

## Why

- Cross-agent + retries es el pan de cada día del orchestrator-runner;
  sin idempotency, el repo acumula commits duplicados con SHAs
  distintos.
- "One source of truth" → un evento = un commit, no dos.
- Pieza de la regla "proposal-needs-evidence" → un commit auto sin
  idempotency key rompe la trazabilidad de auditoría.
- Pieza de `t00021` (test de replay).

## Non-goals

- No usar Redis, DB ni infraestructura remota: filesystem local
  con `withFileMutex`.
- No añadir locking distribuido.
- No implementar dedupe global de commits por contenido (sha); la
  idempotency es por evento, no por contenido.

## Architecture

### 1. Cálculo de la key

```ts
// plugins/commit-policy/src/lib/processed-events.ts
export function computeIdempotencyKey(event: TriggerEvent): string {
  switch (event.kind) {
    case 'slice':
      return `commit-policy:${event.proposalId}:${event.sliceId}:${event.eventId}`;
    case 'threshold':
      return `commit-policy:threshold:${event.triggerId}`;
    case 'interval':
      return `commit-policy:interval:${event.ts}`;
    case 'manual':
      // manual es opt-in; el usuario puede forzar duplicado vía flag
      return event.proposalId
        ? `commit-policy:manual:${event.proposalId}:${(event.sliceId ?? 'none')}`
        : `commit-policy:manual:ad-hoc:${Date.now()}`;
  }
}
```

### 2. Almacén procesado

```ts
// plugins/commit-policy/src/lib/processed-events.ts
export interface ProcessedEventsStore {
  has(key: string): Promise<boolean>;
  add(key: string, meta: { sha: string; ts: number }): Promise<void>;
  prune(ttlMs: number, now?: number): Promise<number>;
}
```

Implementación: JSONL append-only en
`./.commit-policy/processed-events.jsonl`, con read-on-init y
`withFileMutex` para escritura. Rotación al pasar 1 MB o TTL.

### 3. Integración con el engine

En `CommitPolicyEngine.handle()` (`f00266`), antes del stage:

```ts
const key = computeIdempotencyKey(event);
if (await this.processedEvents.has(key)) {
  return { ack: 'ALREADY_PROCESSED', eventId: key };
}
```

Tras commit OK:
```ts
await this.processedEvents.add(key, { sha: result.commitSha, ts: Date.now() });
```

### 4. TTL configurable

Política:
- Default TTL: 30 días (`30 * 24 * 60 * 60 * 1000`).
- Configuración: `mcp-vertex.config.json`
  → `plugins.commitPolicy.idempotencyTtlMs`.
- `prune()` corre al boot y tras cada 100 adds (debounce simple).
- Expiración de key → permitir re-procesar (no es idempotency
  total, sino ventana).

### 5. Errores tipados

| Caso | Salida |
| --- | --- |
| Key duplicada | `ALREADY_PROCESSED` (sin commit) |
| I/O error al leer store | `STORE_READ_ERROR` (sin commit) |
| I/O error al escribir store | `STORE_WRITE_ERROR` (commit ya hecho, log) |

## Slices

- global_gate: lint

### S1 — `processed-events.ts` con TTL + `CommitPolicyEngine` lo consulta

- **Status**: pending
- **Files**: `plugins/commit-policy/src/lib/processed-events.ts`, `plugins/commit-policy/src/lib/engine.ts`, `plugins/commit-policy/tests/src/lib/processed-events.spec.ts`
- **Gate**: type
- **Dependency**: `f00266`
- acceptance:
  - "primer `handle(event)` → commit + key persisted"
  - "replay del mismo evento → ALREADY_PROCESSED, sin commit"
  - "TTL expirado → vuelve a procesar (según policy)"
  - "I/O error de lectura → STORE_READ_ERROR, no commit"
- review-state: in_review
- review-implementer: copilot
## acceptance

- Tests de `t00021` (replay) pasan.
- `processed-events.jsonl` solo crece con append, rota al alcanzar
  tamaño configurable.
- Bajo carga, `has(key)` ≤ 5ms (in-memory + lazy load).
- `bun run lint` verde; `tsc --noEmit` verde.
- Sin dependencias npm nuevas.
