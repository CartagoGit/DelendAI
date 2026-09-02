---
id: t00019
title: "AUD-CP-006 — Threshold staging: reproduce 'predicate ≠ action'"
kind: test
status: review
type: proposal
track: commit-policy
date: 2026-08-25
priority: P1
classification: CONFIRMADO
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track B / t00019"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
    finding: AUD-CP-006
related:
    - q00006
    - x00264 # el fix que se cubre
    - f00182 # engine que ejecuta el staging
last-transition-id: cf5f948f-2f09-4cad-9096-841f4e9ee827
last-correlation-id: cf5f948f-2f09-4cad-9096-841f4e9ee827
last-transition-from: in-progress
---

# t00019 — Threshold staging: reproduce el bug "predicate ≠ action"

## Goal

Reproducir el bug del threshold trigger (AUD-CP-006): el predicado
(umbral cruzado) era correcto pero la acción (qué archivos se
stagean) no coincidía con el conjunto que disparó el predicado.
El test verifica que, una vez corregido por `x00264`, el conjunto
stageado es exactamente el devuelto por `event.files`.

Cobertura:

1. El escenario "predicate ≠ action" repro裸do debe fallar en el
   código buggy y pasar tras el fix de `x00264`.
2. Casos en el borde del umbral (n-1, n, n+1).
3. Staged ajenos preexistentes NO entran en `event.files`.
4. Idempotencia: dos evaluadores sucesivos del mismo dirty set
   generan UN evento (no spam).

## Why

- AUD-CP-006 fue explícitamente diagnosticado como "predicate ≠
  action" en la auditoría externa; el test fija la propiedad que
  la distingue.
- Pieza de aceptación de `x00264`.
- Sin este test, `threshold-tracker.ts` puede regresar al bug.

## Non-goals

- No testear concurrencia cross-agent (eso es `t00018`).
- No testear push policy (eso es `t00066`/`x00266`).
- No añadir thresholds no-uniformes (e.g. percent-based).

## Architecture

### 1. Ubicación

`plugins/commit-policy/tests/src/lib/triggers/threshold-tracker.spec.ts`

### 2. Setup

Mock del repositorio:

```ts
function fakeRepo(files: { path: string; dirty: boolean }[]) {
  return {
    statusPorcelain: () =>
      files.filter(f => f.dirty)
           .map(f => `?? ${f.path}`)
           .join('\n'),
    addMany: (paths: string[]) => { /* … */ },
    diffCached: () => files.filter(f => /* staged */).map(f => f.path),
  };
}
```

El tracker se instancia con este fake y un `engine.handle` spy.

### 3. Tabla de casos

| threshold | dirty | staged ajenos | evento | event.files esperado |
| --- | --- | --- | --- | --- |
| 3 | 2 | — | NO | — |
| 3 | 3 | — | SÍ | esos 3 |
| 3 | 4 | — | SÍ | esos 4 |
| 3 | 3 | 1 (otro agente) | SÍ | solo los 3 del dirty (no el ajeno) |
| 3 | 3 (repeated tick) | — | SÍ × 1 | 1 evento total (idem) |

### 4. Verificación

```ts
it('event.files matches what the predicate observed', async () => {
  const repo = fakeRepo([
    { path: 'a.ts', dirty: true },
    { path: 'b.ts', dirty: true },
    { path: 'c.ts', dirty: true },
  ]);
  const engine = vi.fn();
  const tracker = startThresholdTracker({ threshold: 3, repo, engine });

  await tracker.evaluate();

  expect(engine).toHaveBeenCalledTimes(1);
  expect(engine).toHaveBeenCalledWith(expect.objectContaining({
    kind: 'threshold',
    files: expect.arrayContaining(['a.ts', 'b.ts', 'c.ts']),
  }));
});
```

### 5. Caso adversario

```ts
it('staged ajenos no entran en event.files', async () => {
  const repo = fakeRepo([
    { path: 'a.ts', dirty: true },
    { path: 'a.ts', staged: true }, // staged por otro agente
    { path: 'b.ts', dirty: true },
    { path: 'c.ts', dirty: true },
  ]);
  // …
  // event.files NO contiene paths staged-only
});
```

### 6. Idempotencia entre ticks

```ts
it('repeated tick of the same dirty set → un solo evento', async () => {
  // tick 1 → event (count threshold = 3)
  // tick 2 (same repo state) → NO event
});
```

### 7. Acceptance

```bash
bunx vitest run plugins/commit-policy/tests/src/lib/triggers/threshold-tracker.spec.ts
# → 6 casos verdes
```

## Slices

- global_gate: lint

### S1 — Tests del threshold trigger con tabla y repro del bug

- **Status**: pending
- **Files**: `plugins/commit-policy/tests/src/lib/triggers/threshold-tracker.spec.ts`
- **Gate**: type
- **Dependency**: `x00264`, `f00182`
- acceptance:
  - "tabla de 5 casos pasa"
  - "caso adversario staged-ajeno pasa"
  - "idempotencia entre ticks pasa"
  - "test rojo antes del fix de x00264; verde después"
- review-state: in_review
- review-implementer: sonnet-worker-implementer
## acceptance

- `bunx vitest run` del archivo verde con 6 casos.
- Repro del bug como `it.skip` con comentario claro, o como
  caso histórico en archivo `__buggy_snapshots__/`.
- `bun run lint` verde; `tsc --noEmit` verde.
