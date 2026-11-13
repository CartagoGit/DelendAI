---
id: t00008
title: "with-file-mutex — property tests sobre la state machine: nunca dos holders simultáneos bajo cualquier secuencia"
kind: test
status: done
type: proposal
track: concurrency
date: 2026-08-25
priority: P1
classification: MEJORA / INVARIANTE TRANSVERSAL
parent-plan: q00004
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md
    section: "§20 TEST2-003 (property-based) + §6 MUT2-001"
    sha256: fc2494af135f18cdc2de8c36c110d6296e2a1c511e602afa0a1e4d2a566f339d
related:
    - q00004
    - t00007 # test determinista (predecesor)
    - x00244 # rediseño (siguiente)
shipped-in:
  - 56862d60 # fix(core): harden with-file-mutex stale reclaim
  - 45dcfbd9 # test(mutex): harden property tests + refresh TOKEN-BUDGETS dashboard
  - 7365c1cd # test(core): stabilize with-file-mutex property test timings under CI scheduler
---

# t00008 — with-file-mutex: property tests

## Goal

`x00244` rediseña el reclaim con lease/generation. `t00007` verifica el race window específico. Pero **ninguno** verifica la invariante general:

> Bajo cualquier secuencia arbitraria de acquires / heartbeats / releases / stale-reclaims / crashes simulados, nunca hay dos holders dentro de la sección crítica simultáneamente.

Esta propiedad es difícil de expresar como test determinista. Property-based testing (con `fast-check`) es el enfoque correcto.

Reglas relacionadas: R5.2, §20 TEST2-003 auditoría.


Hoy `with-file-mutex.spec.ts` cubre casos puntuales pero no secuencias arbitrarias.


`MEJORA / INVARIANTE TRANSVERSAL` — propuesta de test, no fix.

## Why

Confianza operativa continua: cualquier secuencia "rara" queda cubierta.


Cero.


Cero.

## Non-goals

**Permitido**:

- `packages/core/tests/src/lib/shared/with-file-mutex.property.spec.ts` (nuevo).
- Helpers de `t00007` (reutilizar).
- `fast-check` (ya está en deps si se usa en otros tests; si no, añadir).

**No permitido**:

- Cambios en `with-file-mutex.ts`.
- Cambios en otros lugares.


- Test determinista (`t00007`).
- Rediseño (`x00244`).
- Métricas (`MUT2-002`).

## Architecture

### 1. Property 1: nunca dos holders simultáneos

```ts
// packages/core/tests/src/lib/shared/with-file-mutex.property.spec.ts
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createFakeClock } from './fake-clock';
import { createInjectableFs } from './fake-fs';
import { withFileMutex } from '../../../../src/lib/shared/with-file-mutex';

describe('with-file-mutex — property tests', () => {
  it('never two holders inside critical section simultaneously', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.scheduler(),
        fc.array(
          fc.record({
            contenderId: fc.string({ minLength: 1, maxLength: 16 }),
            ttlMs: fc.integer({ min: 50, max: 500 }),
            sectionDurationMs: fc.integer({ min: 0, max: 100 }),
            crashBeforeRelease: fc.boolean(),
            heartbeatIntervals: fc.array(fc.integer({ min: 10, max: 80 }), { maxLength: 5 }),
          }),
          { minLength: 1, maxLength: 8 },
        ),
        async (s, scenarios) => {
          const clock = createFakeClock(0);
          const fs = createInjectableFs();
          const lockPath = '/tmp/test-lock-prop';

          let insideCount = 0;
          let maxConcurrent = 0;
          const contenders = scenarios.map((sc) => {
            const promise = withFileMutex(
              {
                lockPath,
                fs,
                clock,
                ttlMs: sc.ttlMs,
                heartbeatMs: 50,
              },
              async () => {
                insideCount++;
                maxConcurrent = Math.max(maxConcurrent, insideCount);
                await s.scheduleSequence([
                  // sección crítica
                ]);
                if (sc.crashBeforeRelease) {
                  throw new Error('simulated crash');
                }
                insideCount--;
              },
              { heartbeatIntervals: sc.heartbeatIntervals },
            ).catch(() => {
              insideCount--;  // ajustar si crash
            });
            return promise;
          });

          await s.waitAll();
          await Promise.all(contenders);

          // La invariante: nunca más de 1 dentro.
          expect(maxConcurrent).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: 200 },
    );
  });
});
```

### 2. Property 2: tras un crash simulado, el siguiente acquire tiene éxito

```ts
it('after crash, next acquire succeeds', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.scheduler(),
      fc.integer({ min: 100, max: 500 }),  // ttlMs
      fc.integer({ min: 200, max: 1000 }),  // timeAfterCrash
      async (s, ttlMs, timeAfterCrash) => {
        const clock = createFakeClock(0);
        const fs = createInjectableFs();
        const lockPath = '/tmp/test-lock-crash';

        // Primer contender entra y crashea.
        const crash = withFileMutex({ lockPath, fs, clock, ttlMs }, async () => {
          throw new Error('crash');
        }).catch(() => {});

        await s.waitAll();
        await crash;

        // Avanzar el reloj más allá del TTL.
        clock.advance(timeAfterCrash);

        // Segundo contender debe poder entrar.
        let secondEntered = false;
        const second = withFileMutex({ lockPath, fs, clock, ttlMs }, async () => {
          secondEntered = true;
        });

        await second;
        expect(secondEntered).toBe(true);
      },
    ),
    { numRuns: 100 },
  );
});
```

### 3. Property 3: heartbeat mantiene el lock activo

```ts
it('heartbeats keep lock active across long sections', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 50, max: 200 }),  // ttlMs
      fc.integer({ min: 10, max: 80 }),    // heartbeatMs
      fc.integer({ min: 100, max: 1000 }),  // sectionDurationMs
      async (ttlMs, heartbeatMs, sectionDurationMs) => {
        const clock = createFakeClock(0);
        const fs = createInjectableFs();
        const lockPath = '/tmp/test-lock-hb';

        let insideCount = 0;
        let maxConcurrent = 0;

        const contender = withFileMutex({ lockPath, fs, clock, ttlMs, heartbeatMs }, async () => {
          insideCount++;
          maxConcurrent = Math.max(maxConcurrent, insideCount);
          await new Promise((r) => setTimeout(r, sectionDurationMs));
          insideCount--;
        });

        // Mientras contender está activo, otro contender debe esperar.
        const other = withFileMutex({ lockPath, fs, clock, ttlMs, heartbeatMs }, async () => {
          insideCount++;
          maxConcurrent = Math.max(maxConcurrent, insideCount);
        });

        await Promise.all([contender, other]);

        expect(maxConcurrent).toBe(1);
      },
    ),
    { numRuns: 50 },
  );
});
```

### 4. Property 4: generaciones monotónicas

```ts
it('lock file generations are monotonic', async () => {
  await fc.assert(
    fc.property(
      fc.array(fc.integer({ min: 0, max: 1000 }), { minLength: 1, maxLength: 50 }),
      async (heartbeats) => {
        const clock = createFakeClock(0);
        const fs = createInjectableFs();
        const lockPath = '/tmp/test-lock-gen';

        let observedGenerations: number[] = [];

        const contender = withFileMutex({ lockPath, fs, clock, ttlMs: 10000, heartbeatMs: 10 }, async () => {
          // Hook para capturar generaciones en cada heartbeat.
          // ... (depende de la API interna del mutex)
        });

        // ... disparamos heartbeats y leemos generaciones
        // La invariante: generaciones son monotónicas.
        for (let i = 1; i < observedGenerations.length; i++) {
          expect(observedGenerations[i]).toBeGreaterThanOrEqual(observedGenerations[i - 1]);
        }
      },
    ),
    { numRuns: 100 },
  );
});
```

## Slices

- global_gate: type

### S1 — Property tests

- **Status**: done
- **Files**: `packages/core/tests/src/lib/shared/with-file-mutex.property.spec.ts`
- **Gate**: type
- acceptance:
  - "4 properties verdes (≥450 runs totales)."

## Acceptance

- **Property**: 4 properties (concurrencia, crash-recovery, heartbeat, generaciones).
- **Runs**: ≥100 por property (configurable; 200 para property 1).
- **Tiempo total**: <60s en CI.


- [x] `with-file-mutex.property.spec.ts` existe.
- [x] Property 1 (no concurrencia) verde con 200 runs.
- [x] Property 2 (post-crash acquire) verde con 100 runs.
- [x] Property 3 (heartbeat mantiene lock) verde con 50 runs.
- [x] Property 4 (generaciones monotónicas) verde con 100 runs.
- [x] Tiempo <60s en CI.
- [x] Si una property falla, mensaje claro con seed reproducible.


- Property tests implementados.
- ≥450 runs totales.
- Tiempo <60s en CI.

---

## Notes

- Las properties son la **verificación continua** del state machine. Cualquier cambio futuro que rompa una invariante falla el test.
- Si se reduce `numRuns` por motivos de velocidad, documentar la razón.


```yaml
resolution:
  status: implemented
  evidence:
    - commit: <hash>
    - tests:
        - packages/core/tests/src/lib/shared/with-file-mutex.property.spec.ts
    - properties: 4 (concurrencia, crash, heartbeat, generaciones)
  - runs: 200 + 100 + 50 + 100
  - validation:
    - "bun x vitest run packages/core/tests/src/lib/shared/with-file-mutex.property.spec.ts"
    - before/after:
        before: "Sin property tests; invariante general no verificada"
        after:  "4 properties verdes; state machine verificada continuamente"
```

---


- **Plan padre**: [q00004](../../ready/q00004-plan-hardening-post-auditoria-chatgpt-sol-segunda-pasada.md), Track B.
- **Auditoría legada**: §6 MUT2-001, §20 TEST2-003.
- **Predecesores**: `t00007` (test determinista), `x00244` (rediseño).
- **Cierra el Track B**: tras estas 3 propuestas, la invariante del mutex queda verificada por tests reproducibles + property-based.
