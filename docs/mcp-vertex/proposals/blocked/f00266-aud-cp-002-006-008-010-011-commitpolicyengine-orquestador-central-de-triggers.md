---
id: f00266
title: "AUD-CP-002/006/008/010/011 — `CommitPolicyEngine`: orquestador central de triggers"
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
    section: "Track B / f00266"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
    finding: AUD-CP-002, AUD-CP-006, AUD-CP-008, AUD-CP-010, AUD-CP-011
related:
    - q00006
    - x00259 # parser invertible que el engine usa
    - x00260 # slice listener entrega eventos
    - x00263 # sliceScoping pasa por el engine
    - x00264 # threshold pasa por el engine
    - x00265 # requireConventional validado aquí
    - x00266 # push policy orquestada aquí
    - x00267 # branch protection chequeda aquí
    - f00267 # idempotency keys en el engine
    - t00017, t00018, t00019, t00020, t00021 # cobertura
---

# f00266 — CommitPolicyEngine: orquestador central de triggers

## Goal

Centralizar en una sola clase `CommitPolicyEngine` la decisión de
qué se stagea, qué se commitea y qué se pushea, aceptando los
triggers actuales del plugin (`slice-listener`, `threshold-tracker`,
`interval-timer`, `manual-trigger`) como productores de eventos
tipados. Hoy cada trigger tiene su propio path al driver, sin
orquestación ni validación centralizada.

### Comportamiento actual

```
slice-listener  ──┐
threshold-tracker ─┤
interval-timer   ─┼─► driver.commit() (cada uno por su lado)
manual-trigger   ─┘
```

### Comportamiento deseado

```
slice-listener  ──┐
threshold-tracker ─┤
interval-timer   ─┼─► CommitPolicyEngine.handle(event)
manual-trigger   ─┘                        │
                                           ├─ valida selector (x00262)
                                           ├─ checa branch policy (x00267)
                                           ├─ valida requireConventional (x00265)
                                           ├─ stagea (x00263, x00264)
                                           ├─ idempotency check (f00267)
                                           ├─ commit
                                           └─ push (x00266)
```

## Why

- 5 hallazgos de auditoría externa (AUD-CP-002, 006, 008, 010, 011)
  convergen aquí: sin orquestador central, la policy se aplica a
  tropezones.
- Pieza base de 6 hijas (x00260, x00263, x00264, x00265, x00266,
  x00267) y de `f00267` (idempotency).
- "One source of truth" → todos los paths pasan por el mismo
  pipeline.
- "Invariant as API or lint" → el chequeo de branch policy, de
  conventional, de selector, de idempotency se realiza una vez,
  no por trigger.

## Non-goals

- No sustituir el event bus global (Track U / futuro).
- No introducir `rxjs` ni librería externa.
- No cambiar las APIs públicas de los tools; el engine se monta
  detrás de `register()` (en `index.ts`).
- No añadir reglas nuevas (e.g. CODEOWNERS, sign-off); solo las
  que ya están declaradas en la config.

## Architecture

### 1. Interfaz pública

```ts
// plugins/commit-policy/src/lib/engine.ts
import type { SliceDoneEvent } from '../triggers/trigger-types';

export type TriggerEvent =
  | { kind: 'slice'; proposalId: string; sliceId: string;
      files: { paths: string[] }; eventId: string }
  | { kind: 'threshold'; files: string[]; threshold: number;
      observedAt: string; triggerId: string }
  | { kind: 'interval'; ts: number }
  | { kind: 'manual'; message: string; proposalId?: string;
      sliceId?: string };

export type EngineResult =
  | { ack: 'OK'; commitSha: string; pushed?: boolean;
      proposalId?: string; sliceId?: string }
  | { ack: 'OK_NO_PUSH'; reason: 'BRANCH_PROTECTED' }
  | { ack: 'SKIP'; reason: 'SKIP_STAGE_EXPLICIT' }
  | { ack: 'ALREADY_PROCESSED'; eventId: string }
  | { ack: 'ERR'; code: RefusalCode; reason: string; raw?: string };

export interface CommitPolicyEngine {
  handle(event: TriggerEvent): Promise<EngineResult>;
  dispose(): Promise<void>;
}
```

### 2. Refusal codes

| Code | Origen |
| --- | --- |
| `SLICE_NOT_FOUND` | x00262 |
| `INCOMPLETE_SELECTOR` | x00262 |
| `SELECTOR_REQUIRED` | x00262 |
| `BRANCH_PROTECTED` | x00267 |
| `REQUIRE_CONVENTIONAL` / `NON_CONVENTIONAL_MESSAGE` | x00265 |
| `SLICE_HAS_NO_FILES` | x00263 |
| `CROSS_AGENT_CONTAMINATION` | x00263 |
| `ALREADY_PROCESSED` | f00267 |

### 3. Pipeline interno

```ts
async handle(event) {
  // 1. Selector validation (slice events only)
  const sliceSelection = await this.validateSliceSelector(event);
  if (sliceSelection.refusal) return sliceSelection.refusal;

  // 2. Branch policy (x00267)
  const branchCheck = this.checkBranchPolicy();
  if (branchCheck.refusal) return branchCheck.refusal;

  // 3. Conventional validation (x00265)
  const conv = await this.validateConventional(message);
  if (conv.refusal) return conv.refusal;

  // 4. Idempotency (f00267)
  const idemKey = computeIdempotencyKey(event);
  if (this.processedEvents.has(idemKey)) return ALREADY_PROCESSED;
  this.processedEvents.add(idemKey);

  // 5. Stage exact files (x00263, x00264)
  const staged = await this.commitDriver.stage(event);
  if (staged.refusal) return staged.refusal;

  // 6. Commit (using the rebuilt header from x00259)
  const commit = await this.commitDriver.commit(message);
  if (commit.refusal) return commit.refusal;

  // 7. Push (x00266)
  const push = await this.pushPolicy.maybePush(commit.sha);

  return { ack: 'OK', commitSha: commit.sha, pushed: push.ok };
}
```

### 4. Wiring en `index.ts`

```ts
const engine = createCommitPolicyEngine({
  commitDriver, pushDriver, pushPolicy, branchPolicy,
  requireConventional, seenStore, processedEvents,
  logger, scheduler,
});

const sliceListener = startSliceListener({ engine, … });
const thresholdTracker = startThresholdTracker({ engine, … });
// interval / manual también

return { tools, knowledge, async dispose() { … } };
```

### 5. Lifecycle

El engine es dueño de:
- `seenEvents: Set<string>` in-memory + sync JSONL al cerrar.
- `processedEvents: Set<string>` (idempotency, vía `f00267`).
- `commitCount`, `windowStart` (push policy, vía `x00266`).
- `dispose()` libera timers y watchers (vía `x00261`).

## Slices

- global_gate: lint

### S1 — CommitPolicyEngine con pipeline único + wiring en `index.ts`

- **Status**: pending
- **Files**: `plugins/commit-policy/src/lib/engine.ts`, `plugins/commit-policy/src/lib/engine.spec.ts`, `plugins/commit-policy/src/index.ts`
- **Gate**: type
- **Dependency**: —
- acceptance:
  - "engine.handle acepta los 4 tipos de TriggerEvent"
  - "todos los paths pasan por selector → branch → conventional → idempotency → stage → commit → push"
  - "los 8 refusal codes están exportados desde el engine"
  - "engine.dispose() para timers y libera processedEvents"
  - "registros de log estructurados para cada paso del pipeline"
- review-state: in_review
- review-implementer: github-copilot-gpt-5.4
## acceptance

- Tests cubren los 4 tipos de eventos y al menos un caso de error
  por refusal code.
- `engine.handle` es la **única** ruta al driver (los triggers solo
  producen eventos).
- `dispose()` deja 0 timers/setHandles/listeners activos.
- `bun run lint` verde; `tsc --noEmit` verde.
- Sin dependencias npm nuevas.
- Pieza base para: x00260, x00263, x00264, x00265, x00266, x00267,
  f00267.
