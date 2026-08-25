---
id: x00234
title: "with-file-mutex — rediseño del stale reclaim con lease/generation + reclaim marker visible (MUT2-001)"
kind: fix
status: ready
type: proposal
track: concurrency
date: 2026-08-25
priority: P1
classification: PROBABLE → mitigación si t00007 reproduce
parent-plan: q00004
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md
    section: "§6 MUT2-001"
    sha256: fc2494af135f18cdc2de8c36c110d6296e2a1c511e602afa0a1e4d2a566f339d
related:
    - q00004
    - t00007 # test race (predecesor: confirma el race)
    - t00008 # property tests (siguiente)
---

# x00234 — with-file-mutex: rediseño del stale reclaim

## Problem

(Resumen del problema — ver `t00007` para el detalle y reproducción.)

El race window entre `observation` y `rename` durante stale reclaim puede permitir dos holders simultáneos. La tokenización protege release pero **no** la exclusión durante el intervalo de quarantine.

Reglas violadas: R5.2 (invariantes), §6 auditoría.

**Estado de la clasificación**: depende del resultado de `t00007`.

- Si `t00007` **reproduce** el race → `x00234` es fix obligatorio (P1).
- Si `t00007` **no reproduce** con los parámetros del test → `x00234` opera como **defensa en profundidad** (P2) + métricas (`MUT2-002`).

Esta propuesta asume el primer caso y propone el rediseño. Si el segundo caso aplica, la propuesta se reduce a "validación empírica + métricas".

## Evidence

(Ver `t00007` para la reproducción.)

Código actual (`packages/core/src/lib/shared/with-file-mutex.ts`):

```ts
async function acquire(lockPath: string): Promise<LockToken> {
  // 1. Try open with O_EXCL
  // 2. If exists, check mtime + ttl
  // 3. If stale, rename lockPath → quarantine
  // 4. Try O_EXCL again
  // ↑ race window entre 3 y 4: heartbeat puede renovar, otro contender crear
}
```

## Classification

`PROBABLE → mitigación`.

## User impact

Si el race se reproduce:

- Corrupción de archivos duraderos (proposals, memory store, locks internos).
- Pérdida silenciosa de datos.

## Privacy impact

Cero.

## Token impact

Cero.

## Scope

**Permitido**:

- `packages/core/src/lib/shared/with-file-mutex.ts` (rediseño).
- `packages/core/src/lib/shared/with-file-mutex.types.ts` (nuevo, si se separan tipos).
- `packages/core/tests/src/lib/shared/with-file-mutex.spec.ts` (actualizar tests existentes).
- Documentación interna: comentario exhaustivo explicando el invariante.

**No permitido**:

- Cambios en callers (deben seguir funcionando con la misma API pública).
- Cambios en otros lugares.

## Out of scope

- Tests (`t00007`, `t00008`).
- Métricas de contention (`MUT2-002`).

## Design

### 1. Lease + Generation

Cada lock file contiene:

- `generation: number` (monotónico).
- `acquiredAt: number` (timestamp).
- `ttlMs: number`.
- `token: string` (UUID).
- `heartbeatAt: number` (timestamp del último heartbeat).
- `holderId: string` (opcional, para diagnóstico).

```ts
interface ILockFile {
  generation: number;
  acquiredAt: number;
  ttlMs: number;
  token: string;
  heartbeatAt: number;
  holderId: string;
}
```

### 2. Reclaim marker visible

Cuando un waiter observa stale, **no renombra directamente**. En su lugar:

1. Crea `lockPath.reclaim-<holderId>-<timestamp>` con:
   - `observedGeneration: number` (la generación que vio).
   - `observedAt: number`.
   - `claimerId: string`.
2. Espera un "grace period" (p. ej. 50ms) para que el holder original pueda renovar.
3. **Verifica de nuevo**: lee `lockPath`. Si ya no existe o tiene una generación más reciente que `observedGeneration`, aborta reclaim.
4. Si sigue stale, **entonces** renombra a quarantine.

```ts
async function reclaimStale(
  lockPath: string,
  claimerId: string,
  observedGeneration: number,
): Promise<boolean> {
  // 1. Escribir reclaim marker.
  const markerPath = `${lockPath}.reclaim-${claimerId}-${Date.now()}`;
  await fs.writeFile(markerPath, JSON.stringify({ observedGeneration, claimerId }));

  // 2. Grace period.
  await sleep(GRACE_PERIOD_MS);

  // 3. Re-verificar lock.
  let current: ILockFile | null;
  try {
    current = await readLockFile(lockPath);
  } catch {
    current = null;  // El lock desapareció mientras esperábamos.
  }

  // 4. Si la generación es más reciente que la observada, el holder renovó.
  if (current && current.generation > observedGeneration) {
    // Abortar reclaim; el lock ya no es stale.
    await fs.unlink(markerPath).catch(() => {});  // best effort
    return false;
  }

  // 5. Si el lock sigue stale, quarantine.
  const quarantinePath = `${lockPath}.quarantine-${claimerId}-${Date.now()}`;
  await fs.rename(lockPath, quarantinePath);

  // 6. Limpiar marker.
  await fs.unlink(markerPath).catch(() => {});

  return true;
}
```

### 3. Heartbeat incrementa generation

Cuando el holder hace heartbeat:

```ts
async function heartbeat(lockPath: string, generation: number, token: string): Promise<boolean> {
  const current = await readLockFile(lockPath);
  if (!current || current.generation !== generation || current.token !== token) {
    // Perdimos el lock (otro contender lo ganó). Salir.
    return false;
  }

  const updated: ILockFile = {
    ...current,
    heartbeatAt: Date.now(),
    generation: current.generation + 1,  // incrementa para invalidar observations
  };

  await fs.writeFile(lockPath, JSON.stringify(updated));
  return true;
}
```

**La clave**: al incrementar `generation`, cualquier observation anterior queda invalidada. Si un waiter tenía `observedGeneration = 5` y el heartbeat incrementa a `6`, el waiter aborta su reclaim.

### 4. API pública (sin cambios para callers)

```ts
export async function withFileMutex<T>(
  opts: {
    lockPath: string;
    ttlMs?: number;
    heartbeatMs?: number;
    fs?: IFsOperations;  // ← inyectable para tests
    clock?: IClock;       // ← inyectable para tests
  },
  fn: () => Promise<T>,
): Promise<T> {
  // ... implementación con lease/generation/reclaim-marker
}
```

Los callers existentes no necesitan cambios.

### 5. Tests actualizados

```ts
// packages/core/tests/src/lib/shared/with-file-mutex.spec.ts
describe('with-file-mutex — lease/generation', () => {
  it('heartbeat increments generation; waiter observes new generation and aborts reclaim', async () => {
    // setup: A adquiere lock, B observa stale
    // A hace heartbeat (gen 0 → 1)
    // B intenta reclaim, ve gen=1 > observed=0, aborta
    // A sigue dentro, sin race
  });

  it('reclaim marker visible to holder; holder aborts on detection', async () => {
    // setup: A adquiere lock, B observa stale y crea marker
    // A detecta marker y sale (o acelera heartbeat)
    // B no entra
  });

  it('three contenders with heartbeat interleaved', async () => {
    // A, B, C compiten; A tiene heartbeat activo; nunca 2 dentro
  });
});
```

## Tests

- **Unit**: actualizar `with-file-mutex.spec.ts` con escenarios lease/generation.
- **Race**: `t00007` debe pasar verde tras este fix.
- **Property**: `t00008` (siguiente propuesta) verifica invariantes.

## Acceptance criteria

- [ ] Lock file incluye `generation` monotónico.
- [ ] Heartbeat incrementa `generation`.
- [ ] Reclaim usa marker visible + grace period + re-verificación.
- [ ] `t00007` pasa verde (race confirmado → race cerrado).
- [ ] API pública sin cambios.
- [ ] Tests existentes siguen pasando.
- [ ] Documentación interna explica el invariante.
- [ ] `bun run validate` verde.

## Regression guards

- **Test `t00007`** continua verificación.
- **Property tests `t00008`** verifican invariantes.
- **Métricas `MUT2-002`** observan contention empíricamente.

## Resolution evidence (template)

```yaml
resolution:
  status: implemented
  evidence:
    - commit: <hash>
    - files-modified:
        - packages/core/src/lib/shared/with-file-mutex.ts
    - before/after:
        before: "Reclaim directo con rename; race window entre observation y rename"
        after:  "Lease + generation; reclaim marker + grace period + re-verificación"
    - tests: t00007 verde, t00008 verde (verificaciones separadas)
```

---

## Slices

- global_gate: type

### S1 — Lease + generation + heartbeat

- **Status**: done
- **Files**: `packages/core/src/lib/shared/with-file-mutex.ts`
- **Gate**: type
- acceptance:
  - "Lock file con generation monotónico."
  - "Heartbeat incrementa generation."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Fase 1 review 2026-08-25: validate verde.
### S2 — Reclaim marker + grace period

- **Status**: pending
- **Files**: `packages/core/src/lib/shared/with-file-mutex.ts`
- **Gate**: type
- acceptance:
  - "Reclaim con marker visible."
  - "Grace period antes de quarantine."
  - "Re-verificación aborta si generación cambió."

### S3 — Tests actualizados

- **Status**: pending
- **Files**: `packages/core/tests/src/lib/shared/with-file-mutex.spec.ts`
- **Gate**: type
- acceptance:
  - "Tests verdes."
  - "`t00007` pasa verde."

## acceptance

- Lease + generation implementado.
- Reclaim marker con grace period.
- Race window cerrado.
- Tests verdes.

---

## Cómo se relaciona con el plan y la auditoría

- **Plan padre**: [q00004](../../ready/q00004-plan-hardening-post-auditoria-chatgpt-sol-segunda-pasada.md), Track B.
- **Auditoría legada**: §6 MUT2-001.
- **Predecesor**: `t00007` (test que confirma el race).
- **Siguiente**: `t00008` (property tests).