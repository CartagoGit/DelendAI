---
id: t00021
title: "AUD-CP-012/§54 — Idempotency: replay del mismo eventId → un solo commit"
kind: test
status: in-progress
type: proposal
track: commit-policy
date: 2026-08-25
priority: P1
classification: CONFIRMADO
parent-plan: q00006
audit-source:
    file: docs/delendai/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track B / t00021"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
    finding: AUD-CP-012, §54
related:
    - q00006
    - f00183 # la feature cuya corrección se cubre
    - f00182 # engine donde se aplica
---

# t00021 — Idempotency: replay del mismo eventId → un solo commit

## Goal

Verificar que `CommitPolicyEngine.handle()` corta el replay del
mismo `eventId` / `triggerId` y devuelve `ALREADY_PROCESSED` sin
ejecutar un segundo commit.

Cobertura:

1. Primer `handle(event)` con `eventId='evt-1'` → commit OK.
2. Replay del mismo evento (mismo `eventId`) → `ALREADY_PROCESSED`,
   no commit, sin stage.
3. `eventId` distinto → otro commit.
4. TTL expirado → permite re-procesar (configurable).
5. Concurrencia: dos `handle(event)` simultáneos con la misma key
   → un solo commit (race protection).
6. Persistencia: tras restart del plugin, el set de keys
   procesadas se repuebla desde el JSONL store.

Pieza de aceptación para `f00183`.

## Why

- AUD-CP-012 (§54 del reporte externo) es exactamente el bug de
  replay no idempotente: cross-agent + retry del orchestrator +
  crash recovery generan commits duplicados con SHAs distintos.
- Sin property-based + casos adversariales, cualquier regresión
  reintroduce el bug.
- Pieza del contrato "one event = one commit" que la auditoría
  externa exige explícitamente.

## Non-goals

- No usar DB ni Redis: filesystem con JSONL.
- No testear el engine completo (eso queda en `engine.spec.ts`).
- No probar TTL expiry con espera real: usar `vi.useFakeTimers()`
  o pasar `now` mockeado al store.

## Architecture

### 1. Ubicación

`plugins/commit-policy/tests/src/lib/processed-events.spec.ts`

### 2. Setup

```ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProcessedEventsStore } from '../../../src/lib/processed-events';

const dir = mkdtempSync(join(tmpdir(), 'cp-idem-'));
const store = await ProcessedEventsStore.open({ dir, ttlMs: 30 * 24 * 60 * 60 * 1000 });

const engine = createCommitPolicyEngine({ processedEvents: store, … });
```

### 3. Tabla de casos

| Caso | Esperado |
| --- | --- |
| `handle({eventId:'e1'})` × 1 | commit OK, key persistida |
| `handle({eventId:'e1'})` × 2 (mismo eventId) | 2ª llamada: `ALREADY_PROCESSED` |
| `handle({eventId:'e2'})` | commit OK, key nueva |
| `handle({eventId:'e3'})` → TTL expirado → replay | segundo sí ejecuta (policy) |
| `handle({eventId:'e1'})` con store vacío tras prune | ejecuta (decisión según policy) |
| `Promise.all(handle(e1) × 3)` simultáneos | 1 commit, 2 `ALREADY_PROCESSED` |
| Restart: `ProcessedEventsStore.open()` re-lee keys | keys anteriores presentes |
| `STORE_WRITE_ERROR` simulado | log estructurado, commit no se pierde |

### 4. Caso crítico de race

```ts
it('three concurrent handles of same eventId → one commit', async () => {
  const event = { kind: 'slice', eventId: 'e1', … };
  const results = await Promise.all([
    engine.handle(event),
    engine.handle(event),
    engine.handle(event),
  ]);
  const commits = results.filter(r => r.ack === 'OK');
  const already = results.filter(r => r.ack === 'ALREADY_PROCESSED');
  expect(commits).toHaveLength(1);
  expect(already).toHaveLength(2);
});
```

La protección se logra con un `Set<string>` in-memory + `Set`
serialización vía `Promise.resolve` (`await this.locks.get(key)…`
o equivalente).

### 5. Persistencia entre restarts

```ts
it('store survives close/open with same dir', async () => {
  await store.add('e1', { sha: 'abc', ts: Date.now() });
  await store.close();
  const reopened = await ProcessedEventsStore.open({ dir, ttlMs: … });
  expect(await reopened.has('e1')).toBe(true);
});
```

### 6. TTL

```ts
it('expired key allows re-processing', async () => {
  await store.add('e1', { sha: 'abc', ts: Date.now() });
  vi.advanceTimersByTime(31 * 24 * 60 * 60 * 1000); // 31 días
  await store.prune();
  expect(await store.has('e1')).toBe(false);
  // engine.handle con eventId='e1' ejecutará
});
```

### 7. Acceptance

```bash
bunx vitest run plugins/commit-policy/tests/src/lib/processed-events.spec.ts
# → 8 casos verdes
```

## Slices

- global_gate: lint

### S1 — Tests de processed-events store + replay + race + persistencia

- **Status**: pending
- **Files**: `plugins/commit-policy/tests/src/lib/processed-events.spec.ts`
- **Gate**: type
- **Dependency**: `f00183`, `f00182`
- acceptance:
  - "tabla de 8 casos pasa"
  - "race-condition: 3 handles simultáneos → 1 commit"
  - "persistencia entre restart funciona"
  - "test rojo antes del fix de f00183; verde después"
- review-state: in_review
- review-implementer: copilot
## acceptance

- `bunx vitest run` del archivo verde con 8 casos.
- Tests deterministas: timeouts de vitest + `vi.useFakeTimers()`
  cuando aplica.
- Cleanup del tmpdir aunque los tests fallen.
- `bun run lint` verde; `tsc --noEmit` verde.
