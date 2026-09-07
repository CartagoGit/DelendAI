---
id: q00021
title: "Plan — Cache Layout Lifecycle & Legacy Reaper: migraciones versionadas de layout para proyectos consumidores, sin LLM, sin coste de tokens, fast-path O(1)"
kind: plan
status: ready
type: proposal
track: trust
date: 2026-09-07
parent:
    - b00239 # Re-brand legacy MCP Vertex → DelendAI (migration engine IMigration/IMigrationJournal ya consolidados)
    - q00019 # State Engine Phase 1 — SQLite shadow driver (necesitamos la conexión SQLite para persistir el epoch)
    - q00020 # Work Telemetry (progress es operational state, NO TTL cache; debe migrar cuando SQLite sea canónico)
depends-on:
    - b00239 S4 # Engine IMigration + journal .delendai/migrations-applied.json + 6 format-specific migrators
    - q00019 # Conexión SQLite consolidada (StateSqliteDriver) para reutilizar como lifecycle state store
nonGoals:
    - "No es un GC que escanea la caché y borra lo que parezca viejo; es un sistema versionado de lifecycle."
    - "No reemplaza ICacheEvictionRegistry (TTL/keepLastN); convive con él."
    - "No reemplaza StateMigrator (schema migrations de un mismo store); convive con él."
    - "No introduce red, LLM, embeddings ni semántica para decidir qué migrar; la decisión está en código versionado."
    - "No borra resultados/`results/` de forma genérica; los records son propiedad del plugin owner."
    - "No escanea el árbol en cada boot; cuando el epoch ya coincide, el coste es exactamente 1 lectura de metadata."
contains:
    proposals:
        - { id: f00513, kind: feat, required: true, priority: P0, track: trust,
            rationale: "S0 — Inventario histórico de layouts: tabla old-path / current-path / owner / class / acción para r00010, f00065, f00080, x00052, rebrand, proposal workflow refactors, progress y JSON→SQLite. Sin este inventario el resto es guesswork." }
        - { id: f00514, kind: feat, required: true, priority: P0, track: trust,
            rationale: "S1 — Contratos puros: ICacheLayoutManifest, ICacheLayoutMigration (extiende IMigration reutilizando `detect`/`plan`/`apply`), ICacheArtifactClass = derived | ephemeral | operational | records. Tests puros sin tocar filesystem." }
        - { id: f00515, kind: feat, required: true, priority: P0, track: trust,
            rationale: "S2 — Lifecycle state store: SqliteLifecycleStateStore (scope=cache-layout, applied_epoch, updated_at) usando la conexión del state-sqlite driver; ILifecycleStateStore interface + fallback a marker sólo si SQLite aún no está consolidado." }
        - { id: f00516, kind: feat, required: true, priority: P0, track: trust,
            rationale: "S3 — Integración en bootstrap: `runPendingCacheLayoutMigrations()` antes de cargar plugins, con cache en memoria del epoch durante la vida del proceso. Acceptance O(1): metadata reads ≤ 1, readdir = 0, stat = 0, write = 0, network = 0." }
        - { id: f00517, kind: feat, required: true, priority: P0, track: trust,
            rationale: "S4 — Migraciones históricas reales (prioridad L1→L5 del pasted text): logs/memory/usage-tracking → results/, caches no canónicas pre-f00065, ephemeral pre-f00080, índices derivados antiguos, rebrand root. Cada migrator respeta las clases (borrar/preservar/migrar)." }
        - { id: f00518, kind: feat, required: true, priority: P1, track: trust,
            rationale: "S5 — Hardcoded path eradication + lint:no-legacy-cache-paths + lint:cache-layout-ratchet. Pasar `rg '\\.cache/mcp-vertex|mcp-vertex' packages plugins tools apps extensions` y clasificar; wirear ambos lints en `validate`." }
        - { id: f00519, kind: feat, required: true, priority: P1, track: trust,
            rationale: "S6 — CLI operator (delendai cache migrations / status / gc) sobre el mismo engine; nada de MCP tool dedicada a disparar migraciones automáticas." }
        - { id: f00520, kind: feat, required: false, priority: P2, track: perf,
            rationale: "S7 (opt-in) — Throttle de `cache_gc`: last_cache_eviction_at + interval configurable para que el dry-run periódico no penalice el boot." }
    unblocks:
        - { id: b00239 S10, rationale: "Cuando entre el epoch cache-layout post-rebrand, el cierre de b00239 deja de tener que llevar el `LegacyMigrationManager` como pieza separada — todo cuelga del engine IMigration ya consolidado." }
        - { id: q00019, rationale: "El JsonToSqliteMigration (queue/progress/counters/checkpoint) reusa el epoch cache-layout y la conexión SqliteLifecycleStateStore; el lifecycle es la palanca que justifica pasar stores a SQLite." }
        - { id: q00020, rationale: "Si el layout de progress cambia (p.ej. de JSON a SQLite), la migración está versionada; progress deja de poder ser tratado accidentalmente como TTL cache." }
---

# q00021 — Plan — Cache Layout Lifecycle & Legacy Reaper

## Goal

Que un proyecto que haya usado **cualquier** versión anterior de DelendAI arranque hoy, sin intervención del usuario, sin gastar un solo token de modelo, sin escanear el árbol, y quede alineado al layout actual — incluyendo `b00239` (rebrand), `r00010` (logs/memory/usage → `results/`), `f00065` (consolidación de caches), `f00080` (ephemeral canónico), `x00052` (proposal workflow), la promoción de SQLite como store canónico (`q00019`), y el nuevo `progress` (`q00020`) como estado **operacional**, no derivable.

El mecanismo es **un sistema determinista de lifecycle versionado** que:

1. introduce un entero `CACHE_LAYOUT_EPOCH`, independiente de la versión npm, del schema SQLite y de cada store;
2. persiste el epoch aplicado por scope (`cache-layout`) en SQLite, reutilizando la conexión del state engine;
3. expone un registry `ICacheLayoutMigrationRegistry` que aplica siempre la cadena `N → N+1` (nunca `N → M` con heurística), siguiendo la filosofía del `legacy-migration.service.ts` ya consolidado por `b00239 S2`;
4. garantiza fast-path O(1) cuando el epoch ya coincide: **1 lectura de metadata, 0 filesystem walk, 0 stat, 0 rm, 0 logs, 0 red, 0 modelo**;
5. clasifica cada artefacto como `derived | ephemeral | operational | records` y aplica la acción correcta (borrar / mover / preservar / migrar);
6. es idempotente y crash-safe (epoch se actualiza al final; rerun tras crash es seguro);
7. se ejecuta antes de cargar plugins, en el bootstrap, donde ya se ejecuta `runPendingMigrations` de `b00239 S4`.

## why

### El hueco que el pasted text señala — y que el repo confirma

`r00010` ([proposal](docs/delendai/proposals/done/refactors/r00010-separate-accumulated-results-logs-memory-usage-tracking-from-derivable-cache-under-cache-mcp-vertex-results.md)) movió `logs`, `memory` y `usage-tracking` a `results/` y **declaró explícitamente** que la migración retroactiva para proyectos consumidores no se implementó. Eso es deuda legacy demostrable hoy.

A eso se suma, en el HEAD actual:

- **b00239 S4** acaba de aterrizar (commit `1de797a76`): los 6 format-specific migrators ya existen, pero el `LegacyMigrationManager` aún es lógica ad-hoc y los paths legacy físicos siguen vivos en el árbol (todavía hay 13+ archivos con `.cache/mcp-vertex` hardcodeado, ver `S5`).
- **q00019** (SQLite shadow driver) está consolidando la conexión SQLite como store canónico. Sin un mecanismo de epoch, los stores que pasen de JSON a SQLite no tendrán cómo versionar el corte sin una capa extra.
- **q00020** introduce `progress`, que **no** debe tratarse como TTL cache — un agente que lo considere borrable por edad pierde trabajo real del swarm.
- Hay tooling/runtime con `.cache/mcp-vertex` literal (`auto-work-invoke` y otros): el rebrand puede **recrear** la ruta legacy después de limpiarla.

El sistema actual (`ICacheEvictionRegistry`) resuelve "este artefacto es válido pero viejo", no "este artefacto pertenece a un layout retirado". Son problemas distintos y necesitan capas distintas.

### Las tres capas que NO deben mezclarse

| Capa                                                              | Qué resuelve                                                    | Dónde vive              |
| ----------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------- |
| **StateMigrator** (`packages/core/src/lib/migrations/migrate.ts`) | Cambios de schema dentro del mismo store (`queue.json v2 → v3`) | Ya existe               |
| **CacheEvictionRegistry** (plugin `cache`)                        | TTL/keepLastN sobre el layout actual                            | Ya existe               |
| **CacheLayoutLifecycle** (este plan)                              | Compatibilidad entre layouts distintos (epoch N → N+1)          | **A crear — este plan** |

Mezclarlas produce bugs reales: un plugin que añade TTL "para limpiar legacy" borra el `results/memory/` de otro owner.

## non-goals

- Reemplazar `ICacheEvictionRegistry` (TTL/keepLastN del layout actual) ni `StateMigrator` (schema migrations). Conviven.
- Inventar un mark-and-sweep global que escanee la caché y borre lo que "no parezca usado". Riesgo: borra plugins deshabilitados temporalmente, custom `cacheDir`, resultados acumulados, extensiones externas.
- Borrar genéricamente `results/` desde el lifecycle. Los records son del plugin owner; él decide su retención.
- Hardcodear rutas legacy (`.cache/mcp-vertex`, etc.) en el runtime/tooling. Si no, el rebrand recrea la basura que acabamos de limpiar.
- Introducir red, embeddings, LLM, MCP ni filesystem walks para decidir qué migrar. La decisión está en código versionado.

---

## architecture

### 1.1 CACHE_LAYOUT_EPOCH

Entero independiente de:

- `version` del `package.json`;
- `STATE_SQLITE_SCHEMA_VERSION` (1 hoy);
- `IMigration.id` (que es un id textual, no un número);
- versiones de cada store individual.

```ts
// packages/core/src/lib/cache/cache-layout-manifest.ts
export const CACHE_LAYOUT_EPOCH = 9;
```

Cambia **sólo cuando cambia la compatibilidad del layout persistido**. Un bugfix → `9 → 9`. Un cambio legacy `.cache/mcp-vertex/foo → .cache/delendai/foo` → `9 → 10`. JSON → SQLite de un store → `10 → 11`.

#### Cadena de epochs histórica

Esta tabla se rellena en S0 (`f00513`). Es la línea base contra la que el ratchet de §6.3 detecta cambios estructurales no bumpeados. Una nueva entrada **requiere** bump de epoch + al menos un migrator en `cache-layout-migrations-registry.ts`.

| Epoch | Introduced by   | Cambio de layout persistido                                                                                | Commit / propuesta                                           |
| ----- | --------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1     | f00065          | Cache consolidado en `<workspaceRoot>/.cache/delendai/` (mata subproject `.cache` dispersos)               | `tools/scripts/lint/check-cache.script.ts` (umbrella commit) |
| 2     | f00080          | Ephemeral canónico `<pluginCacheDir>/exec/<name>` (mata `os.tmpdir()`, `mkdtempSync(tmpdir…)`, `/tmp/`)    | `tools/scripts/lint/check-ephemeral-paths.script.ts`         |
| 3     | r00010          | `logs/`, `memory/`, `usage-tracking/` → `results/{logs,memory,usage-tracking}/`; consumers **no** migrados | proposal `done/refactors/r00010-*.md`                        |
| 4     | x00052          | `docs/delendai/proposals/index.json` → `.cache/delendai/proposals/index.json` (regenerable)                | `done/legacy/closed/fixes/x00052-*.md`                       |
| 5     | b00239 S4       | legacy `.cache/mcp-vertex/` → `.cache/delendai/`; `delendai.config.json`/`docs/delendai/` también          | commit `1de797a76` (`cache-and-docs.migrator.ts`)            |
| 6     | q00019 S?       | Proposals + counters + status → `state.sqlite` (shadow verified)                                           | pending (`q00019-state-engine-phase-1-*.md`)                 |
| 7     | q00020 S?       | `progress/` → `state.sqlite` (operational, NO TTL cache)                                                   | pending (`q00020-plan-work-telemetry-*.md`)                  |
| 8     | q00019 S?       | `swarm.sqlite` consolida agents, claims, leases, queue, worktree_registry                                  | pending                                                      |
| **9** | **HEAD actual** | **Layout presente: nada que migrar en un workspace recién clonado**                                        | `CACHE_LAYOUT_EPOCH = 9` en `cache-layout-manifest.ts`       |

> **Implicación para S4**: las migraciones L1–L5 cierran los huecos de los epochs `3` (L1) y `5` (L5, parcialmente — los sub-paths operativos y records dentro del path legacy `.cache/mcp-vertex/`). Los epochs `1`–`2` ya están consolidados por los lints `check-cache` y `check-ephemeral-paths`; S4 no necesita replicarlos. Los epochs `6`–`8` son trabajo futuro de q00019/q00020 y se incorporarán cuando sus migrators JSON→SQLite aterricen.

### 1.2 Persistencia del epoch

Reutilizar la conexión SQLite del state engine. NO crear una segunda DB.

```sql
-- en STATE_SQLITE_SCHEMA_SQL (extender)
CREATE TABLE IF NOT EXISTS lifecycle_meta (
    scope TEXT PRIMARY KEY,
    applied_epoch INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
```

Fila inicial:

```
scope = 'cache-layout'
applied_epoch = 9
```

Conceptualmente:

```ts
export interface ILifecycleStateStore {
  getAppliedEpoch(scope: 'cache-layout'): Promise<number | null>;
  setAppliedEpoch(scope: 'cache-layout', epoch: number): Promise<void>;
  withMigrationLock<T>(fn: () => Promise<T>): Promise<T>;
}
```

`SqliteLifecycleStateStore` (en `packages/state-sqlite/`) es la implementación canónica. Si `q00019` aún no estuviera consolidado cuando se ejecute S3, fallback a marker temporal en `.delendai/cache-layout-applied.json` (NO fuera del cache, siguiendo la convención `b00239 S2`). **Importante: `sqlite_schema_version ≠ cache_layout_epoch`** — son ejes ortogonales.

### 1.3 Fast-path obligatorio

```ts
// pseudocódigo en el bootstrap
const applied = await lifecycleState.getAppliedEpoch('cache-layout');
if (applied === CACHE_LAYOUT_EPOCH) {
  return; // O(1): 1 lectura de metadata, nada más
}
```

Cuando coincide:

- ❌ `readdir`
- ❌ recursive walk
- ❌ `stat`
- ❌ glob
- ❌ hash del filesystem
- ❌ `rm`
- ❌ logs informativos
- ❌ lectura de propuestas
- ❌ comprobación de timestamps
- ❌ invocación MCP
- ❌ modelo, embeddings, red

Cachear el resultado durante la vida del proceso (`Map<string, number>` module-level) para que la comprobación ocurra **una vez por boot**, no una vez por entrypoint.

### 1.4 Cuándo ejecutar

Orden canónico en `packages/core/src/lib/cli/assemble.ts` (donde ya corre `runPendingMigrations` de `b00239`):

```
resolve workspace
↓
resolve corePaths/cacheDir
↓
open lifecycle metadata (SQLite o marker fallback)
↓
run pending cache-layout migrations (S3 hook)
↓
run pending identity migrations (b00239 — ya existe)
↓
load/register plugins
↓
normal DelendAI boot
```

Las migraciones de layout **antes** de identidad: si identidad renombra el path legacy `.cache/mcp-vertex → .cache/delendai`, el lifecycle debe haber clasificado el contenido antes del rename. De lo contrario, el contenido nuevo cae sobre artefactos no clasificados.

### 1.5 Registry de migraciones

Reutilizar la forma de `IMigration` (`packages/core/src/lib/contracts/interfaces/workspace-migration.interface.ts`). No inventar `ICacheLayoutMigration` desde cero: extender.

```ts
// packages/core/src/lib/cache/cache-layout-migration.ts
export interface ICacheLayoutMigrationContext extends IMigrationContext {
  readonly cacheDirAbs: string;          // resuelto y validado
  readonly lifecycleState: ILifecycleStateStore;
  readonly helpers: ICacheLayoutHelpers; // dropDerived, moveIfDestinationMissing, ...
}

export interface ICacheLayoutHelpers {
  readonly dropDerived: (relPath: string) => Promise<void>;
  readonly moveIfDestinationMissing: (fromRel: string, toRel: string) => Promise<'moved' | 'kept-source' | 'skipped-conflict'>;
  readonly removeEmptyDirectory: (relPath: string) => Promise<void>;
  readonly pathExists: (relPath: string) => Promise<boolean>;
  readonly assertContained: (relPath: string) => void;
  readonly migrateStore: <T>(...) => Promise<void>;       // merge de records
  readonly importStoreToSqlite: <T>(...) => Promise<void>; // JSON → SQLite
}

export interface ICacheLayoutMigration extends IMigration {
  readonly fromEpoch: number;
  readonly toEpoch: number;
}
```

Aplicar siempre la cadena completa:

```
5 → 6 → 7 → 8
```

Nunca `5 → 8` con heurística. Si falta un tramo, error explícito (mismo patrón que `StateMigrator` ya rechaza cadenas incompletas y downgrades).

#### Integración con `DEFAULT_MIGRATIONS` (sin engine paralelo)

El Cache Layout Lifecycle **se registra como un migrator más** dentro del engine `legacy-migration.service.ts` consolidado por `b00239 S4`. No existe un engine paralelo, ni un segundo journal, ni una segunda pila de errores. Esto es deliberado y se concreta en tres puntos:

1. **Una sola entry en `DEFAULT_MIGRATIONS`** (`packages/core/src/lib/workspace-migration/migration-registry.ts:36`):

   ```ts
   export const DEFAULT_MIGRATIONS: readonly IMigration[] = [
     // ... los 6 migrators de b00239 S4 + cache-and-docs ...
     createCacheLayoutReaper(),  // ← nueva entry de q00021
   ] as const;
   ```

   El `id` declarado es `cacheLayoutReaper:v9` (uno por epoch actual; cada bump genera `cacheLayoutReaper:v10`, etc.).

2. **Un solo journal en `.delendai/migrations-applied.json`**. El `applied_epoch` del cache-layout vive en la misma fila que el resto de migraciones, con un campo adicional `cache_layout_epoch?: number` opcional al final del registro. Esto evita:
   - dos archivos de estado con riesgo de divergencia;
   - duplicación de la lógica de "fast-path O(1) cuando no hay nada que hacer";
   - tener que sincronizar dos crons/limpiadores.

3. **Hook en `packages/cli/src/lib/cli/entrypoint.ts#ensureMigrated`** (donde ya se invoca `ensureWorkspaceMigrated`). El cache-layout reaper corre **antes** de los migrators de identidad (L5 antes de L2), y la salida de su `plan()` se prepende al array `legacyPaths` del `bootstrapCacheLayout` posterior. Así una sola pasada de filesystem reconcilia identidad + layout, en orden topológico.

> **Por qué NO un engine separado**: la historia reciente (`b00239 S2`→`S4`) costó consolidar el engine actual. Reabrirlo duplicaría journals, error classes, gates de idempotencia y surfaces de testing, sin aportar ninguna propiedad nueva — el engine actual ya implementa todo lo que un cache-layout lifecycle necesita (`detect`/`plan`/`apply`, journal, silent-on-success, `IMigrationOutcome`).

### 1.6 Clasificación obligatoria (las 4 clases)

| Clase         | Ejemplos                                                        | Acción permitida                                           |
| ------------- | --------------------------------------------------------------- | ---------------------------------------------------------- |
| `derived`     | proposal index, drift snapshot, generated rules cache           | borrar y regenerar                                         |
| `ephemeral`   | verify scratch, old exec artefacts, crashed tmp files           | borrar                                                     |
| `operational` | queue, progress, locks, checkpoint, counters, peer-review state | migrar o preservar                                         |
| `records`     | `results/memory`, `results/logs`, `results/usage-tracking`      | migración específica del owner; **nunca** borrado genérico |

Regla de seguridad absoluta: **el Legacy Reaper no puede borrar genéricamente `results/`**. Esto NO impide que el plugin `logs` conserve los últimos N logs (eso es eviction, no lifecycle). Lo prohibido es `"esto parece viejo → delete results/foo"` desde el lifecycle genérico.

### 1.7 Primitivas (helpers)

Evitar veinte `fs` operations inline en cada migration. Helpers pequeños, auditables, reutilizables:

- `dropDerived(path)` — borrar sabiendo que se puede regenerar
- `moveIfDestinationMissing(from, to)` — atómico, respeta coexistencia
- `removeEmptyDirectory(path)`
- `pathExists(path)`
- `assertContained(path)` — rechaza `..` y symlinks fuera del workspace
- `migrateStore(...)` — merge de records por clave estable
- `importStoreToSqlite(...)` — transacción: BEGIN, insertar, validar counts, devolver

Garantizan: containment, symlink safety, atomicidad, report, idempotencia.

---

### 2. Catálogo inicial de migraciones (S4)

Resultado de S0 (inventario). Aquí el catálogo **mínimo** que ya sabemos necesario:

### L1 — Pre-`results/` (`r00010`)

```
<cacheDir>/logs/             → <cacheDir>/results/logs/
<cacheDir>/logs-errors/      → <cacheDir>/results/logs-errors/
<cacheDir>/memory/           → <cacheDir>/results/memory/
<cacheDir>/usage-tracking/   → <cacheDir>/results/usage-tracking/
```

**No borrar fuentes.** Migrar:
- memory → merge de notes por ID/clave estable
- logs → merge/relocate JSONL preservando eventos
- usage → merge sin perder historical spend

Sólo tras validar el destino: borrar la fuente. **Este caso es P0**: `r00010` dijo expresamente que la migración para consumidores quedó pendiente.

### L2 — Caches no canónicas pre-`f00065`

Auditar:

```
tools/scripts/.cache
subproject/.cache
app/.cache
```

Si son artefactos de DelendAI conocidos y totalmente derivables: `dropDerived`. La migration lleva la **lista histórica conocida**, no hace recursive scan.

### L3 — Ephemeral paths pre-`f00080`

```
.verify-tmp/
scratch temporales
compiled bundles temporales
old exec directories
driver snapshots antiguos
```

`dropDerived` con la lista conocida.

### L4 — Índices derivados antiguos

Todo índice que:
- tiene nueva ubicación;
- pasó a SQLite;
- se regenera desde los `.md` (p.ej. `proposals/index.json`)

Borrar en la ruta legacy. Regenerable.

### L5 — Rebrand legacy `MCP Vertex → DelendAI`

Cuando quede fijado, NO `rm -rf` el path legacy `.cache/mcp-vertex`. Clasificar contenido:

- **Derived** (`bootstrap`, `drift`, `rules cache`, `proposal index`, `verify`, old generated snapshots) → descartar.
- **Operational** (`agent queue`, `progress`, `proposal counters`, `pending integration`, `checkpoint`, `peer-review state`) → migrar.
- **Records** (`results/*`) → migrar/conservar.
- **Worktrees** → comprobar estado; huérfanos/derivables limpian vía APIs git, no dejar metadata git rota.

**Custom `cacheDir`**: si el host usa `{"cacheDir": ".foo/bar"}`, el engine opera sobre el root resuelto. **NO** tocar el legacy `.cache/mcp-vertex` ni `.cache/delendai` basándose sólo en los defaults.

---

### 3. JSON → SQLite (cuando `q00019` sea canónico)

Para cada store que pase de JSON a SQLite:

1. `BEGIN IMMEDIATE`
2. importar filas
3. validar counts/invariantes
4. commit
5. eliminar el JSON antiguo
6. actualizar `applied_epoch`

Nunca `delete JSON → import DB`. Si el proceso crashea durante el import:

- el JSON debe seguir presente
- la transacción debe rollback
- el siguiente boot repite
- el epoch no avanza

Esto es el "JsonToSqliteMigration" que reutilizará `q00019 S?` para la conexión.

---

### 4. Concurrencia y crash safety

### Concurrencia

Varios procesos/agentes pueden arrancar DelendAI simultáneamente.

```ts
await lifecycleState.withMigrationLock(async () => {
  const applied = await lifecycleState.getAppliedEpoch('cache-layout');
  if (applied === CACHE_LAYOUT_EPOCH) return;
  // ... aplicar chain
});
```

`withMigrationLock` usa `BEGIN IMMEDIATE` en SQLite (lock exclusivo de escritura), o el primitive equivalente del `state-sqlite` driver. Nunca dos migraciones destructivas en paralelo.

### Crash safety

- Idempotente (rerun tras crash = mismo resultado)
- Fuente solo se borra después de destino válido
- Epoch solo se actualiza al final
- Para movimientos grandes: `copy → verify → atomic rename → source delete`
- Para SQLite: transacción

Cada migration devuelve `IMigrationOutcome` (ya tipado en `legacy-migration.service.ts`) para que el rerun sepa si quedó a medias.

---

### 5. Filesystem safety

Todas las rutas de migrations deben:

- resolverse contra workspace/cache root
- comprobar containment (`assertContained`)
- rechazar `..` escape
- no seguir symlinks que saquen la operación del workspace
- no aceptar paths del LLM
- no construir comandos shell para borrar
- usar APIs de filesystem tipadas

Reutilizar las garantías que ya viven alrededor de `resolveWorkspaceContained` (en `packages/core/src/lib/shared/`).

---

### 6. Hardcoded path eradication (S5)

### 6.1 Pasada manual

```bash
rg 'legacy \.cache/mcp-vertex|mcp-vertex' packages plugins tools apps extensions
```

Cada hit clasificado en una de estas categorías:

| Categoría                  | Acción                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Código runtime/tooling     | usar exclusivamente `DEFAULT_CORE_PATHS`, `ctx.cacheDir`, `ctx.pluginCacheDir`, `buildSwarmPaths(…)`, `cacheRoot()` |
| Tests + migration fixtures | pueden conservar literales cuando prueban compatibilidad                                                            |
| Docs/propuestas `done/`    | pueden conservar contexto histórico                                                                                 |

Inventario esperado (HEAD actual ya muestra ≥13 archivos con el path legacy `.cache/mcp-vertex` en tests; la pasada completa es S5 S1).

### 6.2 Lint: `lint:no-legacy-cache-paths`

Falla cuando source/runtime/tooling introduce literalmente el path legacy `.cache/mcp-vertex/...` o `.mcp-vertex/...`.

Permitido (whitelist por path):
- `packages/core/src/lib/workspace-migration/migrations/*.ts` (los migrators deben conocer el nombre viejo para detectarlo)
- `packages/core/src/lib/cache/cache-layout-migration-*.ts` (registro de migraciones históricas)
- `tests/**/migration-fixtures/**`
- `docs/delendai/proposals/done/**`

### 6.3 Lint: `lint:cache-layout-ratchet`

Si alguien modifica `CACHE_LAYOUT_MANIFEST` (ver §7) sin incrementar `CACHE_LAYOUT_EPOCH`, CI falla. Implementación: snapshot checksum del manifest bajo `tests/cache/layout-manifest.spec.ts`.

---

### 7. Manifest (`CACHE_LAYOUT_MANIFEST`)

Documentación ejecutable del layout actual. NO es fuente de verdad para mark-and-sweep; sólo:

- documenta el layout actual;
- detecta cambios estructurales;
- asigna ownership;
- genera tests;
- **obliga** a pensar en compatibilidad.

```ts
type CacheArtifactClass = 'derived' | 'ephemeral' | 'operational' | 'records';

interface ICacheArtifactDescriptor {
  readonly id: string;          // 'proposal-index', 'progress', 'memory', ...
  readonly owner: string;       // 'proposals', 'q00020', 'memory', ...
  readonly path: string;        // 'proposals/index.json', 'results/memory', ...
  readonly class: CacheArtifactClass;
}

export const CACHE_LAYOUT_MANIFEST = {
  epoch: 9,
  artifacts: [
    { id: 'proposal-index',    owner: 'proposals', path: 'proposals/index.json',                class: 'derived' },
    { id: 'proposal-progress', owner: 'proposals', path: 'progress/proposal-progress.json',     class: 'operational' },
    { id: 'memory',            owner: 'memory',    path: 'results/memory',                      class: 'records' },
    { id: 'logs',              owner: 'logs',      path: 'results/logs',                        class: 'records' },
    { id: 'usage-tracking',    owner: 'usage-tracking', path: 'results/usage-tracking',        class: 'records' },
    // ...
  ],
} as const;
```

TTL NO va aquí. TTL sigue siendo propiedad del eviction registry.

---

### 8. Plugins externos

Default: `unknown = preserve`. No borrar caches de plugins externos por no reconocerlas.

Extensión futura (no en este plan):

```ts
// en plugin manifest
cacheLifecycle: { epoch: 3, migrations: [...] }
```

Fuera de alcance de q00021. Primero resolver core + plugins built-in.

---

### 9. Relación con `cache_gc`

| Aspecto                 | `cache_gc`                             | `cache_layout_migrator` (este plan)  |
| ----------------------- | -------------------------------------- | ------------------------------------ |
| Cuándo corre            | periódico / manual                     | una vez por cambio de epoch          |
| Qué decide              | TTL, keepLastN                         | `N → N+1` migrations explícitas      |
| Fuente de la decisión   | `ICacheEvictionRegistry` (declarativa) | `CACHE_LAYOUT_MIGRATIONS` (registry) |
| Coste en boot           | (optimizable en S7)                    | **O(1) cuando ya coincide**          |
| Puede borrar `results/` | sólo vía regla explícita del owner     | **NO**                               |

No se sustituye `cache_gc`. Se añade el lifecycle por encima.

---

### 10. CLI operator (S6)

Documentar y exponer:

```
delendai cache status          # epoch actual, último aplicado, pendientes
delendai cache migrations      # lista las migraciones registradas (declaration order)
delendai cache migrate --dry-run
delendai cache migrate         # apply pending
delendai cache gc              # delega al cache_gc existente (sin cambios)
```

La CLI usa el mismo engine. **No** añadir herramienta MCP dedicada a disparar migraciones — el usuario no debería tener que pedirle al agente "limpia la cache". Debe ocurrir por versión.

---

### 11. Throttle de `cache_gc` (S7, opt-in)

Problema: el boot sweep de `cache_gc` con `runOnBoot` y dry-run por defecto puede penalizar arranque.

Solución: `last_cache_eviction_at` + `cacheEvictionIntervalMs` (default 24h). Fast-path:

```ts
if (now - lastCacheEvictionAt < cacheEvictionIntervalMs) return;
```

Slice independiente. Modifica comportamiento del eviction existente → puede necesitar compat flag.

---

## slices

Cada slice es atómico, tiene gate explícito, y se entrega en PR separado. La numeración sigue la convención `S0`-`S7` del pasted text.

### S0 — Inventario histórico (entregable: `f00513`)
- **Status**: pending
- **Files**: `docs/delendai/proposals/ready/chores/f00513-inventory.md`
- **Tarea**: tabla `old-path / current-path / owner / class / acción / introducido-en / seguro-borrar` para `r00010`, `f00065`, `f00080`, `x00052`, rebrand, proposal workflow refactors, `q00019` (SQLite stores), `q00020` (progress).
- **Gate**: el documento contiene las 5 secciones L1-L5 con ≥1 entrada cada una, y referencia explícita al commit hash donde se introdujo cada cambio.
- **Aceptación**: firmado por el `proposal_guardian` o un reviewer que **no** sea el autor.

### S1 — Contratos puros (entregable: `f00514`)
- **Status**: pending
- **Files**:
  - `packages/core/src/lib/contracts/interfaces/cache-layout.interface.ts`
  - `packages/core/src/lib/cache/cache-layout-manifest.ts` (constante inicial, NO destructivo)
  - `packages/core/src/lib/cache/cache-layout-migration.ts` (helpers tipados)
  - `packages/core/tests/src/lib/cache/cache-layout-migration.spec.ts`
- **Tarea**: tipos puros. `IMigration` se reutiliza tal cual (no se duplica); `ICacheLayoutMigration extends IMigration` añade `fromEpoch/toEpoch/helpers`. `ICacheArtifactClass` enum + tabla de clasificación.
- **Gate**: tests puros verdes (sin filesystem, sin SQLite).
- **Aceptación**: ningún `fs` import en `cache-layout-migration.ts`. `IMigration.detect` se mantiene como contrato del probe barato.

### S2 — Lifecycle state store (entregable: `f00515`)
- **Status**: pending
- **Files**:
  - `packages/core/src/lib/contracts/interfaces/lifecycle-state.interface.ts`
  - `packages/state-sqlite/src/lib/lifecycle-state-store.ts`
  - `packages/state-sqlite/src/lib/lifecycle-state-store.spec.ts`
  - extender `STATE_SQLITE_SCHEMA_SQL` con `CREATE_LIFECYCLE_META_TABLE_SQL`
- **Tarea**: `SqliteLifecycleStateStore implements ILifecycleStateStore`. Reutiliza la conexión de `packages/state-sqlite/src/lib/sqlite-driver.ts`. `withMigrationLock` usa `BEGIN IMMEDIATE`. Fallback a marker en `.delendai/cache-layout-applied.json` si SQLite no consolidado.
- **Gate**: tests con SQLite in-memory (existente) + test de fallback con marker.
- **Aceptación**: `getAppliedEpoch('cache-layout')` con epoch ya escrito retorna exactamente el número (no `null`).

### S3 — Integración en bootstrap (entregable: `f00516`)
- **Status**: pending
- **Files**:
  - `packages/core/src/lib/cache/cache-layout-bootstrap.ts`
  - `packages/core/src/lib/cache/cache-layout-bootstrap.spec.ts`
  - extender `packages/core/src/lib/cli/assemble.ts` (insertar el hook antes del `runPendingMigrations` de `b00239`)
- **Tarea**: hook que abre lifecycle state, lee epoch, decide, ejecuta. Cache en memoria durante la vida del proceso.
- **Gate**: metadata reads ≤ 1; filesystem enumerations = 0; filesystem writes = 0; network calls = 0.
  - `metadata reads ≤ 1`
  - `filesystem enumerations = 0`
  - `filesystem writes = 0`
  - `network calls = 0`
- **Aceptación funcional**: dos boots consecutivos, el segundo no toca filesystem. Test que mockea el `IMigrationContext` y verifica que `detect()` no se invoca cuando `applied === CACHE_LAYOUT_EPOCH`.

### S4 — Migraciones históricas (entregable: `f00517`)
- **Status**: pending
- **Files**:
  - `packages/core/src/lib/cache/migrations/logs-to-results.migrator.ts`
  - `packages/core/src/lib/cache/migrations/memory-to-results.migrator.ts`
  - `packages/core/src/lib/cache/migrations/usage-tracking-to-results.migrator.ts`
  - `packages/core/src/lib/cache/migrations/legacy-non-canonical-cache.migrator.ts`
  - `packages/core/src/lib/cache/migrations/old-ephemeral-paths.migrator.ts`
  - `packages/core/src/lib/cache/migrations/rebrand-root.migrator.ts`
  - `packages/core/tests/src/lib/cache/migrations/` (uno por migrator)
  - `packages/core/src/lib/cache/cache-layout-migrations-registry.ts`
- **Tarea**: implementar L1-L5 del §2. Cada migrator: `detect()` (probe barato, sin enumerar), `plan()` (qué haría), `apply()` (ejecuta la acción de su clase). Clasificación por `class` de cada descriptor en `CACHE_LAYOUT_MANIFEST`.
- **Gate**: tests con fixtures que simulan el layout viejo; `results/memory` nunca se borra genéricamente; coexistencia origen/destino sin overwrite.
- **Aceptación**: las migraciones `r00010` corre sin tocar contenido de `results/` (los registros sobreviven).

### S5 — Hardcoded paths + lint (entregable: `f00518`)
- **Status**: pending
- **Files**:
  - `packages/rules/src/rules/no-legacy-cache-paths.rule.ts`
  - `packages/rules/src/rules/cache-layout-ratchet.rule.ts`
  - `packages/rules/tests/src/rules/no-legacy-cache-paths.rule.spec.ts`
  - `packages/rules/tests/src/rules/cache-layout-ratchet.rule.spec.ts`
  - Whitelist documentada en cada rule.
- **Tarea**: pasar `rg` y clasificar cada hit. Eliminar los que sean runtime/tooling. Whitelist para migrators, fixtures y docs.
- **Gate**: `bun run validate` falla si un PR nuevo introduce el path legacy `.cache/mcp-vertex/...` en runtime/tooling. El ratchet falla si se modifica `CACHE_LAYOUT_MANIFEST.epoch` o la lista de `artifacts` sin bump de `CACHE_LAYOUT_EPOCH`.

### S6 — CLI operator (entregable: `f00519`)
- **Status**: pending
- **Files**:
  - `packages/cli/src/commands/cache.command.ts`
  - `packages/cli/src/commands/cache/status.command.ts`
  - `packages/cli/src/commands/cache/migrate.command.ts`
  - `packages/cli/src/commands/cache/migrations.command.ts`
  - `packages/cli/src/commands/cache/gc.command.ts` (delega al cache_gc existente)
  - tests correspondientes
- **Tarea**: subcomandos que invocan el engine. **No** añade tool MCP.
- **Gate**: cada subcomando tiene `--dry-run`. Salida estructurada (JSON opcional) sin texto narrativo.

### S7 — Throttle de `cache_gc` (entregable: `f00520`, opt-in)
- **Status**: pending
- **Files**: plugin `cache` (extender), config schema, tests.
- **Tarea**: `lastCacheEvictionAt` + `cacheEvictionIntervalMs`. Aplica sólo si el eviction registry tiene reglas con `runOnBoot`.
- **Gate**: dry-run respeta el throttle. Test de clock virtual avanza 24h y verifica que el GC corre.

---

## acceptance

NO usar `< 1.7ms` como gate. CI es ruidoso.

Usar gate **operacional** (en `tests/perf/cache-layout-fast-path.spec.ts`):

| Operación                                                    | Permitido |
| ------------------------------------------------------------ | --------- |
| Lecturas de metadata                                         | **≤ 1**   |
| Enumeraciones de filesystem (`readdir`, `glob`, walk)        | **0**     |
| Operaciones de escritura (`write`, `rename`, `rm`, `unlink`) | **0**     |
| Llamadas de red                                              | **0**     |
| Logs informativos                                            | **0**     |

Se puede añadir benchmark informativo aparte; no es gate. La única promesa estricta: **coste constante y sin escaneo cuando el proyecto ya está actualizado**.

---

### 14. Tests de aceptación obligatorios

### Fast path (S3)
Con `applied_epoch === CACHE_LAYOUT_EPOCH`:

- ≤ 1 lectura de metadata
- 0 `readdir`, 0 `stat`, 0 `rm`, 0 escrituras, 0 logs, 0 llamadas externas

Verificación: spy sobre `fs.promises.*` y sobre `lifecycleState.getAppliedEpoch` cuenta exactamente 1.

### Second boot (S3+S4)
```
boot 1: migration corre
boot 2: O(1) no-op
boot 3: O(1) no-op
```

### r00010 fixture (S4 L1)
Fixture: `cache/memory`, `cache/logs`, `cache/usage-tracking` con datos sintéticos.
Resultado: `cache/results/memory`, `cache/results/logs`, `cache/results/usage-tracking`.
**Todos los registros sobreviven.**

### Derived (S4 L4)
Legacy proposal index en ruta antigua: eliminado. Regenerable posteriormente vía `sync_proposals`.

### JSON → SQLite (S3+S4 — cuando `q00019` canónico)
Fixture con `queue`, `progress`, `counters`, `checkpoint`. Verificar: `rows imported`, `commit successful`, `legacy removed only afterwards`.

### Crash
Inyectar fallo en mitad de migration. Segundo intento: `no corruption`, `no duplicate state`, `successful retry`. Epoch no avanzó en el primer intento.

### Concurrency
Dos migrators simultáneos (procesos/agents). Sólo uno ejecuta acciones.

### Custom cacheDir
Nunca toca defaults incorrectamente. Test: `{"cacheDir": ".foo/bar"}` opera sobre `.foo/bar`.

### Symlink escape
`assertContained` rechaza symlink a `..` o fuera del workspace.

### Unknown plugin
Directorio no reconocido: **preserved**.

### Records
Intentar `dropDerived('results/memory')`: **hard failure** (lanza o aborta con error explícito).

### Epoch chain
Falta migration `7 → 8`: aborta con mensaje claro.

### Layout ratchet (S5)
Modificar `CACHE_LAYOUT_MANIFEST.artifacts` sin incrementar `epoch`: CI falla.

### Legacy literal ratchet (S5)
Introducir el path legacy `.cache/mcp-vertex/foo` en nuevo runtime source: CI falla.

---

## risks and mitigations

1. Un consumidor puede saltar varias generaciones de DelendAI y llegar al layout actual **automáticamente** (sin intervención, sin LLM).
2. Todos los datos no regenerables sobreviven (`results/memory`, `results/logs`, `results/usage-tracking`).
3. Todo artefacto derivable conocido de layouts retirados desaparece.
4. El nuevo DelendAI no vuelve a recrear ninguna ruta legacy (lint `no-legacy-cache-paths` lo impide).
5. Las migrations son idempotentes y crash-safe.
6. Las migrations **no** usan LLM ni MCP ni red ni embeddings ni filesystem walks cuando el epoch ya coincide.
7. Un proyecto ya migrado no escanea el filesystem en posteriores boots.
8. SQLite (`q00019`) y filesystem migrations mantienen versiones independientes (enteros distintos, schema version vs cache layout epoch).
9. Plugins externos/desconocidos no sufren borrados automáticos.
10. `bun run validate` queda green.
11. CI obliga a cualquier futuro cambio de layout a traer su migration correspondiente (ratchet).

---

## notes

| Riesgo                                       | Mitigación                                                                                |
| -------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Un migrator rompe datos reales               | Tests con fixtures, gate de "records nunca se borran genéricamente", `dryRun` por defecto |
| Concurrencia: dos procesos migran a la vez   | `withMigrationLock` (`BEGIN IMMEDIATE`); el segundo ve epoch ya actualizado y sale        |
| Crash a mitad de migration                   | Idempotencia + epoch al final; rerun seguro                                               |
| Path safety (symlink, `..`)                  | `assertContained` en todos los helpers; tests dedicados                                   |
| Custom `cacheDir` no respetado               | Engine opera sobre root resuelto; tests con `cacheDir` custom                             |
| Performance regression                       | Gate operacional (no absoluto); spy en fs en tests                                        |
| Sobrescritura de coexistencia origen/destino | `moveIfDestinationMissing` no sobrescribe; reporta conflicto                              |
| Olvido de bumpear epoch al cambiar layout    | Lint ratchet + snapshot checksum                                                          |

---

### 17. Decisión arquitectónica final

No implementar un "limpiador inteligente de cosas que DelendAI no esté usando".

Implementar:

> **Un sistema determinista de lifecycle versionado.**

Regla:

```
current artifact + stale        → eviction policy
old known layout + derived      → delete once
old known layout + persistent   → migrate once
unknown                         → preserve
already on current epoch        → do nothing
```

Esto elimina basura histórica sin convertir DelendAI en un daemon que reescanea constantemente su propia caché, y sin gastar un solo token de modelo para decidir qué conservar.

---

### 18. Relación con el resto del cascade

- **b00239 S4** (recién aterrizado) → provee `IMigration`/`IMigrationJournal`/registry. q00021 los reutiliza y los especializa para layout.
- **b00239 S10** (`LegacyMigrationManager`) → cuando q00021 aterrice, ese manager deja de ser lógica ad-hoc; cuelga del engine IMigration consolidado.
- **q00019** (SQLite shadow) → provee la conexión SQLite que `SqliteLifecycleStateStore` reusa. Sin q00019, S2 cae al fallback marker.
- **q00020** (progress) → al pasar a SQLite (o cambiar de ubicación), JsonToSqliteMigration usa el epoch cache-layout. Progress deja de poder ser tratado como TTL cache.
- **r00010** (done) → la migración L1 cierra la deuda explícita que r00010 dejó pendiente para consumidores.

### 19. Orden recomendado de ejecución

```
S0 (inventario)
   ↓
S1 (contratos)
   ↓
S2 (lifecycle state — depende de q00019 consolidado)
   ↓
S3 (bootstrap + fast-path gate)
   ↓
S4 (L1 → L5, priorizando r00010 + hardcoded paths)
   ↓
S5 (lint + hardcoded path eradication)
   ↓
S6 (CLI operator)
   ↓
S7 (cache_gc throttle, opt-in)
```

S4 puede entregarse en varios PRs siguiendo la prioridad L1 > L2 > L3 > L4 > L5.

---

### 20. Anexo: relación con el pasted text original

El pasted text que motiva este plan tiene 29 secciones; este `q00021` las mapea así:

| Sección pasted                | Dónde vive aquí              |
| ----------------------------- | ---------------------------- |
| §1-§2 (problema, principio)   | §"why" + §1                  |
| §3-§4 (epoch, persistencia)   | §1.1, §1.2                   |
| §5 (fast-path)                | §1.3, §13, §14               |
| §6 (cuándo ejecutar)          | §1.4                         |
| §7 (registry)                 | §1.5, §1.7                   |
| §8 (NO mark-and-sweep)        | §"non-goals", §"why"         |
| §9 (clasificación)            | §1.6                         |
| §10 (primitivas)              | §1.7                         |
| §11 (catálogo L1-L5)          | §2                           |
| §12 (JSON → SQLite)           | §3                           |
| §13 (progress)                | §"why" + §18 (q00020)        |
| §14 (hardcoded paths)         | §6                           |
| §15 (lint no-legacy)          | §6.2                         |
| §16 (lint layout)             | §6.3                         |
| §17 (manifest)                | §7                           |
| §18 (plugins externos)        | §8                           |
| §19-§20 (concurrencia, crash) | §4                           |
| §21 (filesystem safety)       | §5                           |
| §22 (logging)                 | §1.3 (sin logs en fast-path) |
| §23 (tokens = 0)              | §"non-goals", §15            |
| §24 (relación cache_gc)       | §9                           |
| §25 (throttle)                | §11                          |
| §26 (slices S0-S7)            | §12                          |
| §27 (tests de aceptación)     | §14                          |
| §28 (criterio perf)           | §13                          |
| §29 (DoD)                     | §15                          |

**Delta material del pasted text que se incorpora:**

- §3 (epoch independiente) — incorporado
- §4 (marker file como fallback) — refinado: SQLite preferido, marker sólo si `q00019` no consolidado
- §5 (NO logs en fast-path) — incorporado como gate operacional explícito
- §9 (clasificación 4 clases) — incorporada; regla de "results nunca genérico" como DoD
- §11 L1-L5 — adaptado al estado actual del repo (L1 = `r00010` con paths concretos)
- §12 (JSON → SQLite con transacción) — incorporado; bloqueado por `q00019`
- §13 (progress como operational) — referencia a `q00020`
- §14-§16 (lints) — incorporados como S5
- §23 (tokens = 0) — DoD literal
- §28 (gate operacional, no absoluto) — incorporado

**Lo que el pasted text sugería pero el estado actual ya provee:**

- "`packages/core/src/lib/migrations/migrate.ts` como runner versionado" — sí existe; `IMigration` ya está tipado. q00021 **reutiliza** este contrato (no lo reinventa).
- "convención `.delendai/`" — `b00239 S2` ya la establece (`migration-registry.ts:36`). q00021 la extiende con `.delendai/cache-layout-applied.json` para el fallback marker.
- "`classifyResidual` ya distingue live/historical/vendored/generated" — `b00239 S8` ya lo hace (`classify-residual.service.ts`). q00021 reusa el vocabulario para `ICacheArtifactClass` con los 4 valores y semántica compatible (records ≈ historical preservado).