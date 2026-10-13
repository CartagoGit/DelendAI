---
id: x00260
title: "AUD-CP-002 — Slice listener: conectar el evento al engine (no descartar)"
kind: fix
status: done
type: proposal
track: commit-policy
date: 2026-08-25
priority: P0
classification: CONFIRMADO
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track B / x00260"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
    finding: AUD-CP-002
related:
    - q00006
    - t00018 # cross-agent safe staging
    - x00263 # sliceScoping stagea exactos (depende de este)
    - x00259 # parser invertible para el header del commit
    - f00182 # CommitPolicyEngine, dependencia dura
shipped-in:
    - ef8bc957f38517644b215b81cccea3badde5cb3f # fix(commit-policy): x00260 — slice listener delivers events to engine
---

# x00260 — AUD-CP-002: el slice listener debe entregar los eventos al engine

## Goal

El listener que detecta cierre de slice
(`plugins/commit-policy/src/lib/triggers/slice-listener.ts`)
**debe entregar cada evento detectado al
`CommitPolicyEngine.handle()`** (entregado por `f00182`) y solo
marcar el evento como visto **si y solo si** el engine confirma
éxito. Hoy el listener detecta → marca visto → descarta, lo que
produce eventos perdidos y cross-agent contamination.

### Comportamiento actual (BUG)

```
listener detecta slice-done
  → markSeen(eventId)
  → engine NO se llama
```

### Comportamiento deseado

```
listener detecta slice-done
  → engine.handle({ kind: 'slice', proposalId, sliceId, files })
  → si engine responde { ack: 'OK' } → markSeen(eventId)
  → si engine responde { ack: 'ERR' } → NUNCA markSeen
  → si engine throws → NUNCA markSeen, schedule retry (ver abajo)
```

## Why

- Sin entrega al engine, los archivos del slice nunca se stagean
  atómicamente — el commit policy ejecuta sin saber qué pasó.
- El listener descarta silenciosamente, así que no hay señal de
  "evento perdido" en logs; auditoría externa no puede verificar.
- Cross-agent safe staging (`x00263` + `t00018`) requieren que el
  engine reciba `files: […]` exactos y decida stagear; hoy se
  entrega `files: []` y el driver interpreta "skipAdd: true".
- Este es un bug "predicado ≠ acción": el código afirma que vigila
  cierres de slice, pero no actúa.

## Non-goals

- No introducir event bus global (eso es Track U / `q00006` futuro).
  Usar callback inyectable.
- No cambiar la API pública del tool `commit_policy_status` (se
  mantiene).
- No rehacer `slice-listener` desde cero; refactorizar el `_seen`
  interno para que `markSeen` sea perezoso y condicional.

## Architecture

### 1. Inyección del callback del engine

```ts
// plugins/commit-policy/src/lib/triggers/slice-listener.ts
export interface SliceListenerOptions {
  engine: Pick<CommitPolicyEngine, "handle">;
  store?: SeenEventsStore;          // filesystem local; default OK
  retry?: RetryPolicy;              // default: 3 reintentos, exp backoff
  onError?: (e: unknown) => void;   // log + notification plugin
}
```

`register()` en `plugins/commit-policy/src/index.ts` instancia el
engine (`f00182`) y se lo pasa al listener. No se introduce bus
externo.

### 2. Máquina de estados de un evento

```
DETECTED ──► engine.handle()
              │
              ├─ ack=OK        ──► SEEN  (persiste en store)
              ├─ ack=RETRYABLE ──► RETRY (sigue siendo DETECTED)
              └─ ack=ERR_FATAL ──► DEAD   (notifica, NO SEEN)
```

`markSeen` solo se ejecuta en el camino `ack=OK`.

### 3. Persistencia de "seen"

- Mismo `withFileMutex` que ya usa el plugin (no introducir
  dependencia nueva).
- Clave: `${proposalId}:${sliceId}:${eventId}` en un JSONL
  append-only; leer al boot para repoblar el set in-memory.
- Rotación: a 1 MB o 30 días, configurable.

### 4. Errores tipados

| Caso | Salida |
| --- | --- |
| engine throws | retry hasta `retry.maxAttempts`; luego DEAD |
| engine devuelve `SLICE_HAS_NO_FILES` | DEAD (decisión humana) |
| engine devuelve `ALREADY_PROCESSED` | SEEN (idempotente) |
| I/O en store falla | retry; tras agotar, fatal sin SEEN |

## Slices

- global_gate: lint

### S1 — Listener entrega cada evento al engine antes de marcar visto

- **Status**: done
- **Files**: `plugins/commit-policy/src/lib/triggers/slice-listener.ts`, `plugins/commit-policy/src/index.ts`, `plugins/commit-policy/tests/src/lib/triggers/slice-listener.spec.ts`
- **Gate**: type
- **Dependency**: `f00182` (engine)
- acceptance:
  - "engine recibe el evento con `files` exactos del slice"
  - "engine falla → evento NO se marca visto"
  - "engine éxito → evento se marca visto una sola vez"
  - "replay manual del mismo evento produce un solo handle()"
- review-state: done
- review-implementer: GitHub
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Revisión independiente PASS: wiring listener→engine, files exactos, retry sin marcar visto en fallo, éxito idempotente y replay sin duplicación; test estrecho y typecheck del plugin verdes.
## acceptance

- Cero eventos detectados sin acción correspondiente en
  `engine.handle`.
- Logs estructurados: `{ event: 'slice.detected', proposalId,
  sliceId, engine: 'OK' | 'RETRY' | 'ERR' }`.
- `t00018` (cross-agent) corre sin eventos perdidos.
- `bun run lint` verde; `tsc --noEmit` verde.
- Sin dependencias nuevas en `package.json`.
