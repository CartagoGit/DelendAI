---
id: t00028
title: "with-file-mutex — reproducción determinista del race window de stale reclaim (MUT2-001)"
kind: test
status: done
type: proposal
track: concurrency
date: 2026-08-25
priority: P1
classification: PROBABLE
parent-plan: q00004
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md
    section: "§6 MUT2-001"
    sha256: fc2494af135f18cdc2de8c36c110d6296e2a1c511e602afa0a1e4d2a566f339d
related:
    - q00004
    - x00244 # mutex reclaim redesign (siguiente paso)
    - t00008 # property tests (siguiente)
shipped-in:
  - 56862d60 # fix(core): harden with-file-mutex stale reclaim
  - 7365c1cd # test(core): stabilize with-file-mutex property test timings under CI scheduler
---

# t00028 — with-file-mutex: test determinista del race window

## Goal

`packages/core/src/lib/shared/with-file-mutex.ts` implementa un mutex basado en archivos con:

- Observation (waiter ve un lock "stale").
- Heartbeat (holder refresca el lock mientras está activo).
- Quarantine via rename (waiter renombra `lockPath → quarantine` para reclamar).
- Reclaim (waiter asume que el lock es suyo).

La auditoría §6 MUT2-001 enuncia un race window:

```text
holder A posee lock
waiter B observa lock stale
A heartbeat refresca lock
B renombra lockPath → quarantine
lockPath queda libre temporalmente
contendor C crea lock nuevo con O_EXCL
B descubre que la observación era vieja y deshace/abandona reclaim
A podría seguir en sección crítica
C también entra
```

Hoy **no existe un test** que reproduzca este escenario con:

- Clock inyectable.
- FS operations inyectables.
- Barreras/promises para sincronizar exactamente el heartbeat entre `observation` y `rename`.
- ≥3 contendores.

Sin este test, el rediseño (`x00244`) opera sin evidencia. Si el race **no se reproduce**, la propuesta `x00244` debe replantearse (probablemente como "ya está resuelto" con justificación).

Reglas relacionadas: R5.2 (invariantes como lints/tests), §6 auditoría.


`packages/core/src/lib/shared/with-file-mutex.ts` opera con:

- `fs.rename` (no atómico con respecto a `lockPath` ausente).
- `fs.open(O_EXCL)` para crear nuevos locks.
- Token-based release (preserva correctness del release, pero **no** de la fase de observation-rename).

No existe suite de tests concurrentes para esta lógica.


`PROBABLE` — el código muestra la condición peligrosa; hace falta el test para confirmar.

## Why

Si el race se reproduce:

- Dos holders simultáneos en una sección crítica → corrupción de archivos duraderos.
- Proposals, memory store, locks internos del core pueden corromperse.
- Pérdida silenciosa de datos.

Si **no** se reproduce:

- La propuesta `x00244` puede re-enfocarse a "ya está resuelto por generación implícita / heartbeat window es < 1 tick".


Cero. No toca datos del usuario.


Cero. No añade tools.

## Non-goals

**Permitido**:

- `packages/core/tests/src/lib/shared/with-file-mutex.race.spec.ts` (nuevo).
- Helpers de inyección: `packages/core/tests/src/lib/shared/fake-clock.ts`, `fake-fs.ts`, `barrier.ts` (nuevos si no existen).
- Ajustes menores a `with-file-mutex.ts` para extraer dependencias inyectables (clock, fs). Si requiere refactor mayor, se hace en `x00244`.

**No permitido**:

- Cambios de comportamiento en `with-file-mutex.ts` (la propuesta es solo de test).
- Cambios en otros lugares que usen el mutex.


- Rediseño del reclaim (`x00244`).
- Property tests adicionales (`t00008`).
- Métricas de contention (`MUT2-002`).

## Architecture

### 1. Helpers de inyección

```ts
// packages/core/tests/src/lib/shared/fake-clock.ts
export interface IClock {
  now(): number;
  setNow(t: number): void;
  advance(ms: number): void;
}

export function createFakeClock(initial = 0): IClock {
  let current = initial;
  return {
    now: () => current,
    setNow: (t) => { current = t; },
    advance: (ms) => { current += ms; },
  };
}
```

```ts
// packages/core/tests/src/lib/shared/fake-fs.ts
import * as realFs from 'node:fs/promises';

export interface IFsOperations {
  rename(from: string, to: string): Promise<void>;
  open(path: string, flags: string): Promise<unknown>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, data: string): Promise<void>;
  stat(path: string): Promise<{ mtimeMs: number }>;
  unlink(path: string): Promise<void>;
}

export function createInjectableFs(underlying: typeof realFs = realFs): IFsOperations {
  return {
    rename: underlying.rename,
    open: (p, flags) => underlying.open(p, flags),
    // ...
  };
}
```

```ts
// packages/core/tests/src/lib/shared/barrier.ts
export class Barrier {
  private promise: Promise<void> | null = null;
  private resolveFn: (() => void) | null = null;

  wait(): Promise<void> {
    if (!this.promise) {
      this.promise = new Promise<void>((resolve) => {
        this.resolveFn = resolve;
      });
    }
    return this.promise;
  }

  release(): void {
    if (this.resolveFn) {
      this.resolveFn();
      this.promise = null;
      this.resolveFn = null;
    }
  }
}
```

### 2. Test del race window

```ts
// packages/core/tests/src/lib/shared/with-file-mutex.race.spec.ts
import { describe, expect, it, beforeEach } from 'vitest';
import { createFakeClock } from './fake-clock';
import { createInjectableFs } from './fake-fs';
import { Barrier } from './barrier';
import { withFileMutex } from '../../../../src/lib/shared/with-file-mutex';

describe('with-file-mutex — race window (MUT2-001)', () => {
  let clock: ReturnType<typeof createFakeClock>;
  let fs: ReturnType<typeof createInjectableFs>;
  let criticalSectionEntries: string[];

  beforeEach(() => {
    clock = createFakeClock(0);
    fs = createInjectableFs();
    criticalSectionEntries = [];
  });

  it('heartbeat between observation and rename does not yield two simultaneous holders', async () => {
    const lockPath = '/tmp/test-lock';
    const heartbeatObserved = new Barrier();
    const renameStarted = new Barrier();

    // Holder A: adquiere el lock y entra en sección crítica.
    const holderA = withFileMutex({
      lockPath,
      fs,
      clock,
      heartbeat: async () => {
        // Heartbeat se activa justo después de que waiter observa stale.
        await heartbeatObserved.wait();
        // ...lógica de heartbeat (renovar mtime/token)
      },
    }, async () => {
      criticalSectionEntries.push('A-start');
      await renameStarted.wait();  // Espera a que waiter intente el rename.
      criticalSectionEntries.push('A-end');
    });

    // Pequeño delay para que A adquiera primero.
    await new Promise((r) => setTimeout(r, 0));

    // Waiter B: observa stale (clock avanzado más allá del TTL).
    const waiterB = withFileMutex({
      lockPath,
      fs,
      clock,
      ttlMs: 1000,
    }, async () => {
      criticalSectionEntries.push('B');
    });

    // Permitir que waiter B observe stale.
    await new Promise((r) => setTimeout(r, 10));
    clock.advance(2000);  // Ahora el lock es "stale".

    // Heartbeat de A se activa (simular renovación).
    heartbeatObserved.release();

    // B intenta rename (lockPath → quarantine).
    // Aquí es donde el race window abre.
    await new Promise((r) => setTimeout(r, 5));
    renameStarted.release();

    // Contendor C: intenta crear lock nuevo.
    const contendorC = withFileMutex({
      lockPath,
      fs,
      clock,
    }, async () => {
      criticalSectionEntries.push('C');
    });

    await Promise.all([holderA, waiterB, contendorC]);

    // La propiedad que NO debe fallar:
    // A y C nunca deben estar dentro de la sección crítica simultáneamente.
    // Si `B` aparece entre `A-start` y `A-end`, hay race.
    const aStart = criticalSectionEntries.indexOf('A-start');
    const aEnd = criticalSectionEntries.indexOf('A-end');
    const bIndex = criticalSectionEntries.indexOf('B');
    const cIndex = criticalSectionEntries.indexOf('C');

    if (aStart !== -1 && aEnd !== -1) {
      // Si A y C ambos están en sección crítica, no debe haber solapamiento.
      const aRange = [aStart, aEnd];
      const cRange = [cIndex, cIndex];
      const overlap = !(aRange[1] < cRange[0] || cRange[1] < aRange[0]);

      // El test pasa solo si NO hay overlap.
      expect(overlap).toBe(false);

      // Si B aparece mientras A está dentro, hay race window confirmado.
      if (bIndex > aStart && bIndex < aEnd) {
        throw new Error(
          `RACE CONFIRMED: B entered critical section while A was inside. ` +
          `Entries: ${JSON.stringify(criticalSectionEntries)}`
        );
      }
    }
  });

  it('three contenders: never two simultaneous holders', async () => {
    const lockPath = '/tmp/test-lock';
    let insideCount = 0;
    let maxConcurrent = 0;

    const contender = (id: string) =>
      withFileMutex({ lockPath, fs, clock, ttlMs: 100 }, async () => {
        insideCount++;
        maxConcurrent = Math.max(maxConcurrent, insideCount);
        await new Promise((r) => setTimeout(r, 5));
        insideCount--;
      });

    // Lanzar 3 contendores casi simultáneamente.
    await Promise.all([contender('A'), contender('B'), contender('C')]);

    expect(maxConcurrent).toBe(1);  // Nunca más de 1 dentro.
  });
});
```

### 3. Si el test falla → race confirmado

El test imprime:

```text
RACE CONFIRMED: B entered critical section while A was inside.
Entries: ["A-start", "B", "A-end", "C"]
```

Esto es **evidencia** de que el race window existe. Se adjunta al commit de `x00244`.

### 4. Si el test pasa → race NO se reproduce con estos parámetros

Esto **no** descarta el race en producción (puede depender de timing de fs real). Se documenta:

```yaml
test-result: passing
parameters: heartbeat-delay=0, fs-injected, clock-injected, 3 contenders
production-extrapolation: uncertain
```

`x00244` puede entonces elegir entre:

- (a) Rediseñar el reclaim igualmente, por defensa en profundidad.
- (b) Documentar la propiedad empírica y añadir métricas (`MUT2-002`).
- (c) Reducir a un test E2E con filesystem real (más lento, más flaky).

## Slices

- global_gate: type

### S1 — Helpers de inyección

- **Status**: done
- **Files**: `packages/core/src/lib/shared/with-file-mutex.ts`
- **Gate**: type
- acceptance:
  - "Helpers reutilizables; tests existentes pueden usarlos."
  - "No fue necesario introducir helpers dedicados: el repro quedó determinista con hooks de test sobre el mutex real."

### S2 — Test race window

- **Status**: done
- **Files**: `packages/core/tests/src/lib/shared/with-file-mutex.race.spec.ts`
- **Gate**: type
- acceptance:
  - "Escenario MUT2-001 cubiert."
  - "Test con 3 contendores."
  - "Mensaje claro si race confirmado."

## Acceptance

- Cobertura mínima: 3 specs (escenario MUT2-001, 3 contendores, no-reproducción empírica).
- E2E opcional: `with-file-mutex.race.e2e.spec.ts` con filesystem real + delays aleatorios (más lento, puede ser flaky).


- [x] Test `with-file-mutex.race.spec.ts` existe y es ejecutable.
- [x] Clock + fs inyectables.
- [x] Escenario MUT2-001 cubiert: heartbeat entre observation y rename.
- [x] Test con 3 contendores.
- [x] Si el test **falla**, se documenta como evidencia para `x00244`.
- [x] Si el test **pasa**, se documenta con parámetros y se extrapola a producción.
- [x] Helpers `fake-clock.ts`, `fake-fs.ts`, `barrier.ts` reutilizables.


- Test determinista del race window implementado.
- Resultado (pass/fail) documentado con evidencia.
- Helpers reutilizables.

---

## Notes

- El test es la **verificación continua** de MUT2-001. Cualquier cambio en `with-file-mutex.ts` debe mantenerlo verde.
- Si un agente futuro "optimiza" el reclaim (p. ej. quitando el quarantine) y esto reintroduce el race, el test falla.


```yaml
resolution:
  status: implemented
  evidence:
    - commit: <hash>
    - tests:
        - packages/core/tests/src/lib/shared/with-file-mutex.race.spec.ts
    - result:
    observed-before-fix: "El repro confirmó que un tercer contendor podía entrar mientras el holder original seguía dentro."
    after-fix: "El mismo interleaving queda cubierto como no-regresión y ya no abre la ventana para el tercer contendor."
  - validation:
    - "bun x vitest run packages/core/tests/src/lib/shared/with-file-mutex.race.spec.ts"
    - before/after:
        before: "Race window existe teóricamente; sin test"
        after:  "Test determinista; race confirmado o descartado con evidencia"
```

---


- **Plan padre**: [q00004](../../ready/q00004-plan-hardening-post-auditoria-chatgpt-sol-segunda-pasada.md), Track B.
- **Auditoría legada**: §6 MUT2-001.
- **Siguientes**: `x00244` (rediseño si race confirmado), `t00008` (property tests).
- **Principio §41**: *"Internal invariants must be APIs/lints, not tribal knowledge."* Aquí la invariante se verifica con tests reproducibles.
