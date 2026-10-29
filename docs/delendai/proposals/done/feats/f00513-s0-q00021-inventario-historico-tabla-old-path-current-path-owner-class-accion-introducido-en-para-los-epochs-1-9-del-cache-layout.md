---
id: f00513
title: "S0 — q00021 inventario histórico: tabla old-path / current-path / owner / class / acción / introducido-en para los epochs 1-9 del cache layout"
kind: feat
status: done
type: proposal
track: trust
date: 2026-09-07
parent-plan: q00021
contains:
    proposals: []
unblocks:
    - { id: f00514, rationale: "S1 contratos puros — necesita la tabla de S0 para que CACHE_LAYOUT_MANIFEST.artifacts tenga una base histórica, no inventada." }
    - { id: f00517, rationale: "S4 migraciones históricas — S4 consume la tabla por epoch para decidir qué L1-L5 implementar primero." }
tags:
    - cache-layout
    - lifecycle
    - inventory
    - q00021
    - non-llm
closed-at: 2026-09-07T20:15:00Z
last-transition-id: t-2026-09-07-f00513-done
last-correlation-id: c-2026-09-07-f00513-v4
last-transition-from: ready
last-idempotency-key: idem-2026-09-07-f00513-done

---

# f00513 — S0 — q00021 inventario histórico de cambios de layout

## Goal

Producir `docs/delendai/proposals/ready/chores/c00527-f00513-inventory.md` (chore anejo, **read-only w.r.t. código destructivo**) que contenga la tabla canónica:

```
| epoch | introduced-by | old-path | new-path | owner | class | accion | introducido-en | seguro-borrar |
```

para los **epochs 1–9** listados en `q00021 §1.1.1`. La tabla es la línea base contra la que el ratchet de `q00021 §6.3` (`lint:cache-layout-ratchet`) detecta futuros cambios estructurales no bumpeados.

Es **P0 bloqueante**: sin este inventario, S1 (contratos) y S4 (migraciones reales) serían guesswork.

## why

Es **P0 bloqueante**: sin este inventario, S1 (contratos) y S4 (migraciones reales) serían guesswork. El objetivo no es arreglar el layout aquí, sino fijar la línea base histórica que luego usarán el ratchet y los migrators versionados de `q00021`.

## non-goals

- Ejecutar migraciones o borrar artefactos legacy.
- Inventariar plugins externos desconocidos fuera de los paths ya evidenciados.
- Reducir el conteo de hits legacy del runtime; este slice documenta la deuda y su clasificación.
- Resolver TTL/eviction; ese eje sigue en `ICacheEvictionRegistry`.

## architecture

### 1. r00010 — `cache/memory`, `cache/logs`, `cache/usage-tracking` → `cache/results/{memory,logs,usage-tracking}`

Migración L1 del pasted text. **Deuda legacy demostrable hoy**: r00010 dijo expresamente que la migración retroactiva para proyectos consumidores no se implementó.

Inventariar:

- `cache/memory/notes.json` (legacy) → `cache/results/memory/notes.json` (current). owner=`memory`, class=`records`. Acción=`merge-by-id-then-move` (NO delete source hasta validar destino).
- `cache/logs/*.jsonl` → `cache/results/logs/*.jsonl`. owner=`logs`, class=`records`. Acción=`merge-by-timestamp-then-move`.
- `cache/usage-tracking/*.jsonl` → `cache/results/usage-tracking/*.jsonl`. owner=`usage-tracking`, class=`records`. Acción=`merge-by-event-id-then-move`.
- `cache/logs-errors/` → `cache/results/logs-errors/`. owner=`logs`, class=`records`.

### 2. f00065 — caches no canónicas pre-consolidación

Inventariar paths observados en el repo antes de `bun run lint:cache`:

- `tools/scripts/.cache/...` (legacy)
- `subproject/.cache/...` (legacy)
- `app/.cache/...` (legacy)

Acción esperada: `dropDerived` con lista histórica conocida. **No recursive scan** del árbol — la migration lleva la lista.

### 3. f00080 — ephemeral paths pre-canónico

Inventariar:

- `os.tmpdir()` literals en runtime/tooling (ver `rg 'tmpdir|mkdtempSync.*tmpdir|/tmp/' packages plugins --type ts`)
- `.verify-tmp/` top-level → `<cacheDir>/verify-tmp/` (legacy: ya consolidado por `cache-layout-bootstrap.ts` LEGACY_DIRS — verificar cobertura)
- old `exec/` placements fuera de `<pluginCacheDir>/exec/<name>`

### 4. x00052 — `proposals/index.json` docs → cache

Inventariar:

- `docs/delendai/proposals/index.json` (legacy, 62 KB trackeado) → `.cache/delendai/proposals/index.json` (current, regenerable). owner=`proposals`, class=`derived`. Acción=`delete-once-then-regenerate-via-sync_proposals`.

### 5. b00239 (rebrand legacy MCP Vertex → DelendAI)

Inventariar paths **dentro de `.cache/delendai/`** que aún conservan literales legacy en runtime/tooling:

- `.cache/mcp-vertex/foo` (legacy) → `.cache/delendai/foo` (current). Acción: **clasificar contenido** según §6 q00021; no `rm -rf`.

Inventariar **todos los hits del patrón legacy** `rg '\.cache/mcp-vertex|mcp-vertex' packages plugins tools apps extensions --type ts`:

| Hit                                               | Clasificación                                                                 | Acción                 |
| ------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------- |
| runtime/tooling                                   | reemplazar por `ctx.cacheDir` / `DEFAULT_CORE_PATHS.cacheDir` / `cacheRoot()` | required for S5        |
| tests/migration-fixtures                          | preserve                                                                      | whitelist para S5 lint |
| docs históricas (proposals done)                  | preserve                                                                      | whitelist para S5 lint |
| migrators (`workspace-migration/migrations/*.ts`) | preserve (deben conocer el nombre viejo para detectarlo)                      | whitelist              |

### 6. proposal workflow refactors (x00052, b00239 S4, otros)

Inventariar paths que cambiaron de ubicación por refactors del workflow de proposals:

- `docs/delendai/proposals/` (legacy?) — el árbol canónico actual de propuestas
- `proposals/index.json` (migrado por x00052)
- agent queue / locks / peer-review state (b00239)
- proposal counters, registry-versions, round-context digest

### 7. q00019 (SQLite stores — futuro)

Inventariar **stores previstos** que pasarán de JSON a SQLite (la lista exacta sale del plan q00019):

- `proposals/index.json` → `state.sqlite` (phase 2-3)
- `agent-queue/queue.json` → `swarm.sqlite` (phase 5)
- `agents.lock.json` → `swarm.sqlite` (phase 5)
- `proposal-id-counters.json` → `swarm.sqlite` (phase 5)
- `peer-review.log` → `swarm.sqlite` (phase 5)
- `checkpoint/*.json` → `swarm.sqlite` (phase 5)

Owner + class por cada uno (todos `operational` salvo `results/*` que son `records`).

### 8. q00020 (progress — futuro)

Inventariar ubicación actual vs futura del `progress/`:

- `progress/proposal-progress.json` (current, JSON) → `state.sqlite` o ruta nueva (a decidir en q00020)
- class = `operational` (NO `derived`, NO TTL cache). El ratchet debe negarse a aplicar eviction TTL sobre `progress/`.

### Out of scope (no inventariar)

- **TTL de eviction** (sigue siendo del `ICacheEvictionRegistry`).
- **Schema migrations de un mismo store** (sigue siendo del `StateMigrator`).
- **Plugins externos desconocidos** (default `unknown = preserve`; sin manifest, sin inventario).
- **Custom `cacheDir` no estándar del usuario** (el engine opera sobre root resuelto; no catalogar paths fuera del root por defecto).

## slices

### S0 — Documento inventario

- **Status**: done
- **Files**: `docs/delendai/proposals/ready/chores/c00527-f00513-inventory.md`
- **Gate**: `bun tools/scripts/proposals/sync-proposal-registry.script.ts` indexa el anexo sin errores y `bun run lint:proposals` acepta su scaffold.
- **Acceptance**: la tabla principal cubre epochs 1–9, cada fila referencia explícitamente el proposal id o commit, y `class` usa sólo `derived | ephemeral | operational | records`.

## acceptance

- [ ] Documento `docs/delendai/proposals/ready/chores/c00527-f00513-inventory.md` existe y es parseable por `proposals-sync`.
- [ ] Contiene las 8 secciones (r00010, f00065, f00080, x00052, b00239, workflow refactors, q00019 future, q00020 future).
- [ ] Cada fila de la tabla principal referencia explícitamente el commit hash o proposal id donde se introdujo el cambio.
- [ ] El campo `seguro-borrar` está marcado `sí`/`no`/`migrar` por cada entrada.
- [ ] El campo `class` está poblado con uno de los 4 valores: `derived`, `ephemeral`, `operational`, `records`.
- [ ] Review independiente (peer review `proposal_review submit` con `reviewer ≠ author`).
- [ ] Cierre: `proposal_transition q00021/f00513 → done` con `shipped-in: [<commit-hash>]`.

### Entregable

`docs/delendai/proposals/ready/chores/c00527-f00513-inventory.md` — el chore anejo contiene la tabla canónica y la sección de "método de descubrimiento" (qué `rg`/`git log` se usó para cada entrada).

### Tests de aceptación obligatorios

- [ ] `bun run lint:proposals` verde (frontmatter válido, links rotos = 0).
- [ ] `bun tools/scripts/proposals/sync-proposal-registry.script.ts` indexa el nuevo chore anejo sin error (count +1).
- [ ] `rg '\.cache/mcp-vertex|mcp-vertex' packages plugins tools apps extensions --type ts | wc -l` ejecutado al inicio y al final como conteo legacy: el delta documenta cuántos hits quedan (debería ser 0 al cerrar S5).
- [ ] Tabla tiene ≥ 1 entrada por epoch 1–8. Epoch 9 es la fila "HEAD actual, nada que migrar en workspace recién clonado".

### Definition of Done

1. El inventario existe, está revisado y archivado en `docs/delendai/proposals/done/chores/c00527-f00513-*.md`.
2. `q00021` referencia explícitamente este inventario desde §1.1.1 y §2.
3. Sin este slice cerrado, S1 y S4 no pueden empezar (f00514/f00517 quedan bloqueados en `cascadeBoost` hasta que f00513 cierre).

## risks and mitigations

| Riesgo                                                                       | Mitigación                                                                                     |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Inventario incompleto → migrator L1 omite un sub-path real                   | `rg` doble pasada + cross-check con `git log --diff-filter=R --name-status`                    |
| Clasificación incorrecta (e.g. `results/memory` marcado `derived` por error) | Review independiente verifica contra regla §1.6                                                |
| Epoch chain incompleta (falta f00065 o f00080)                               | Cross-check con `tools/scripts/lint/check-cache.script.ts` y `check-ephemeral-paths.script.ts` |
