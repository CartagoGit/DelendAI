---
id: c00527
title: "Anexo — q00021 / f00513 inventario histórico de cache layout (epochs 1–9)"
kind: chore
status: done
type: proposal
track: trust
date: 2026-09-07
parent-plan: q00021
related:
	- f00513
	- f00514
	- f00517
	- r00010
	- f00065
	- f00080
	- x00052
	- b00239
	- q00019
	- q00020
---

# c00527 — inventario histórico de cache layout

## goal

Materializar la tabla canónica pedida por `f00513` para los epochs 1–9 del cache layout en un único documento revisable, indexable y reutilizable por `q00021` como línea base del futuro ratchet `lint:cache-layout-ratchet`.

## why

Sin este inventario, `f00514` y `f00517` arrancan desde conjeturas sobre qué paths fueron legacy, qué clase de artefacto vivía en cada uno y si debe borrarse, regenerarse o migrarse. Este anexo convierte esa historia en datos revisables.

## non-goals

- No ejecutar migraciones ni borrar artefactos.
- No inventariar plugins externos desconocidos fuera de los paths ya evidenciados.
- No reescribir el runtime ni bajar el conteo de hits legacy: este anexo documenta, no corrige.
- No decidir TTL o eviction; eso sigue siendo responsabilidad de `ICacheEvictionRegistry`.

## architecture

### Metodo de descubrimiento

```bash
rg '\.cache/mcp-vertex|mcp-vertex' packages plugins tools apps extensions --type ts | wc -l
rg -n 'results/memory|results/logs|results/usage-tracking|logs-errors' docs/delendai/proposals/done/refactors/r00010*
rg -n 'f00065|f00080|check-cache|check-ephemeral-paths' docs packages tools plugins -g '!node_modules'
rg -n 'proposal-progress\.json|peer-review|proposal-id-counters|agents.lock|queue.json|swarm.sqlite|state.sqlite' packages plugins tools docs -g '!node_modules'
```

### Tabla canonica

| epoch | introduced-by | old-path | new-path | owner | class | accion | introducido-en | seguro-borrar |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | f00065 | `tools/scripts/.cache/**`, `subproject/.cache/**`, `app/.cache/**` | `<workspaceRoot>/.cache/delendai/**` | core | derived | `dropDerived` | `f00065`, `tools/scripts/lint/check-cache.script.ts` | si |
| 2 | f00080 | `os.tmpdir()` / `/tmp/**` / `.verify-tmp/` / old `exec/` outside plugin cache | `<pluginCacheDir>/exec/<name>` and `<cacheDir>/verify-tmp/` | core | ephemeral | `move-if-owned-else-drop` | `f00080`, `tools/scripts/lint/check-ephemeral-paths.script.ts` | migrar |
| 3 | r00010 | `cache/memory/notes.json`, `cache/logs/*.jsonl`, `cache/logs-errors/**`, `cache/usage-tracking/*.jsonl` | `cache/results/{memory,logs,logs-errors,usage-tracking}/**` | memory / logs / usage-tracking | records | `merge-then-move` | `r00010` | migrar |
| 4 | x00052 | `docs/delendai/proposals/index.json` | `.cache/delendai/proposals/index.json` | proposals | derived | `delete-once-then-regenerate` | `x00052` | si |
| 5 | b00239 | `.cache/mcp-vertex/**`, `mcp-vertex.config.json`, runtime/tooling literals `mcp-vertex` | `.cache/delendai/**`, `delendai.config.json`, `delendai` runtime/tooling | core / proposals / docs / CLI | operational | `classify-then-migrate` | `b00239 S4`, commit `1de797a76` | migrar |
| 6 | q00019 | `proposals/index.json` JSON cache / proposal state JSON stores | `state.sqlite` | proposals | operational | `import-store-to-sqlite` | `q00019` | migrar |
| 7 | q00020 | `progress/proposal-progress.json` | `state.sqlite` or successor progress store | progress | operational | `migrate-operational-state` | `q00020` | migrar |
| 8 | q00019 | `agent-queue/queue.json`, `agents.lock.json`, `proposal-id-counters.json`, `peer-review.log`, `checkpoint/*.json` | `swarm.sqlite` | proposals / orchestrator | operational | `import-store-to-sqlite` | `q00019` | migrar |
| 9 | q00021 | fresh clone: no legacy layout pending | `CACHE_LAYOUT_EPOCH = 9` | core | operational | `no-op-fast-path` | `q00021` | no |

### Secciones

### 1. r00010 — results segregation

| old-path | new-path | owner | class | accion | introducido-en | seguro-borrar |
| --- | --- | --- | --- | --- | --- | --- |
| `cache/memory/notes.json` | `cache/results/memory/notes.json` | memory | records | `merge-by-id-then-move` | `r00010` | migrar |
| `cache/logs/*.jsonl` | `cache/results/logs/*.jsonl` | logs | records | `merge-by-timestamp-then-move` | `r00010` | migrar |
| `cache/logs-errors/**` | `cache/results/logs-errors/**` | logs | records | `merge-by-timestamp-then-move` | `r00010` | migrar |
| `cache/usage-tracking/*.jsonl` | `cache/results/usage-tracking/*.jsonl` | usage-tracking | records | `merge-by-event-id-then-move` | `r00010` | migrar |

### 2. f00065 — caches no canonicas pre-consolidacion

| old-path | new-path | owner | class | accion | introducido-en | seguro-borrar |
| --- | --- | --- | --- | --- | --- | --- |
| `tools/scripts/.cache/**` | `.cache/delendai/**` | core | derived | `dropDerived` | `f00065` | si |
| `subproject/.cache/**` | `.cache/delendai/**` | core | derived | `dropDerived` | `f00065` | si |
| `app/.cache/**` | `.cache/delendai/**` | core | derived | `dropDerived` | `f00065` | si |

### 3. f00080 — ephemeral paths pre-canonico

| old-path | new-path | owner | class | accion | introducido-en | seguro-borrar |
| --- | --- | --- | --- | --- | --- | --- |
| `os.tmpdir()` literals / `/tmp/**` runtime scratch | `<pluginCacheDir>/exec/<name>` | core | ephemeral | `move-if-owned-else-drop` | `f00080` | migrar |
| `.verify-tmp/` top-level | `<cacheDir>/verify-tmp/` | core | ephemeral | `move-if-owned` | `f00080` | migrar |
| old `exec/` placements outside plugin cache | `<pluginCacheDir>/exec/<name>` | plugin owner | ephemeral | `move-if-owned-else-drop` | `f00080` | migrar |

### 4. x00052 — proposals index fuera de docs

| old-path | new-path | owner | class | accion | introducido-en | seguro-borrar |
| --- | --- | --- | --- | --- | --- | --- |
| `docs/delendai/proposals/index.json` | `.cache/delendai/proposals/index.json` | proposals | derived | `delete-once-then-regenerate-via-sync_proposals` | `x00052` | si |

### 5. b00239 — rebrand legacy MCP Vertex to DelendAI

| old-path | new-path | owner | class | accion | introducido-en | seguro-borrar |
| --- | --- | --- | --- | --- | --- | --- |
| `.cache/mcp-vertex/**` | `.cache/delendai/**` | core | operational | `classify-content-then-migrate` | `b00239 S4` | migrar |
| `mcp-vertex.config.json` | `delendai.config.json` | core | operational | `rename-structured` | `b00239 S4` | migrar |
| runtime/tooling literals `mcp-vertex` under `packages/`, `plugins/`, `tools/` | `delendai` or path helpers | mixed | operational | `replace-or-whitelist` | `b00239 S4`, `f00518` future lint | no |

### 6. proposal workflow refactors

| old-path | new-path | owner | class | accion | introducido-en | seguro-borrar |
| --- | --- | --- | --- | --- | --- | --- |
| `docs/delendai/proposals/index.json` | `.cache/delendai/proposals/index.json` | proposals | derived | `delete-once-then-regenerate` | `x00052` | si |
| queue / locks / peer-review JSON and logs | `swarm.sqlite` | proposals / orchestrator | operational | `import-store-to-sqlite` | `q00019`, `b00239` | migrar |
| proposal counters / round-context digests / registry versions | SQLite-backed stores or canonical cache slots | proposals | operational | `import-or-regenerate-by-class` | workflow refactors | migrar |

### 7. q00019 future — JSON to SQLite stores

| old-path | new-path | owner | class | accion | introducido-en | seguro-borrar |
| --- | --- | --- | --- | --- | --- | --- |
| `proposals/index.json` | `state.sqlite` | proposals | operational | `import-store-to-sqlite` | `q00019` | migrar |
| `agent-queue/queue.json` | `swarm.sqlite` | proposals | operational | `import-store-to-sqlite` | `q00019` | migrar |
| `agents.lock.json` | `swarm.sqlite` | proposals | operational | `import-store-to-sqlite` | `q00019` | migrar |
| `proposal-id-counters.json` | `swarm.sqlite` | proposals | operational | `import-store-to-sqlite` | `q00019` | migrar |
| `peer-review.log` | `swarm.sqlite` | proposals | operational | `import-store-to-sqlite` | `q00019` | migrar |
| `checkpoint/*.json` | `swarm.sqlite` | proposals | operational | `import-store-to-sqlite` | `q00019` | migrar |

### 8. q00020 future — progress como estado operacional

| old-path | new-path | owner | class | accion | introducido-en | seguro-borrar |
| --- | --- | --- | --- | --- | --- | --- |
| `progress/proposal-progress.json` | `state.sqlite` o successor progress store | progress | operational | `migrate-operational-state` | `q00020` | migrar |

### 9. Epoch 9 — HEAD actual

| old-path | new-path | owner | class | accion | introducido-en | seguro-borrar |
| --- | --- | --- | --- | --- | --- | --- |
| workspace recien clonado sin legacy pendiente | `CACHE_LAYOUT_EPOCH = 9` | core | operational | `no-op-fast-path` | `q00021` | no |

## slices

### S0 — Documento inventario

- **Status**: done
- **Files**: `docs/delendai/proposals/ready/chores/c00527-f00513-inventory.md`
- **Gate**: `bun tools/scripts/proposals/sync-proposal-registry.script.ts` indexa el anexo sin errores y `bun run lint:proposals` acepta su scaffold.
- acceptance:
	- "La tabla principal cubre epochs 1–9."
	- "Cada fila referencia explícitamente el proposal id o commit."
	- "La clasificación usa solo `derived`, `ephemeral`, `operational` o `records`."
- review-state: done
- review-implementer: GitHub
- review-reviewer: delendai-reviewer-20260907
- review-log: approved by delendai-reviewer-20260907 — Aprobado: el anexo existe en la ruta declarada, cubre los epochs 1-9 y la validacion focalizada del gate declarado (`sync-proposal-registry`) ha pasado con errorCount 0.
## acceptance

- `docs/delendai/proposals/ready/chores/c00527-f00513-inventory.md` existe y `sync-proposal-registry` lo indexa sin error.
- La tabla principal contiene al menos una fila por epoch 1–9.
- Cada fila referencia explícitamente el proposal id o commit hash donde nació el cambio.
- `seguro-borrar` usa solo `si`, `no` o `migrar`.
- El conteo legacy documental queda registrado: `rg '\.cache/mcp-vertex|mcp-vertex' packages plugins tools apps extensions --type ts | wc -l` = `258` durante este slice documental.

## risks and mitigations

| Riesgo | Mitigación |
| --- | --- |
| Inventario incompleto | Anchors cruzados entre `q00021`, `r00010`, `f00065`, `f00080`, `x00052`, `b00239`, `q00019` y `q00020`. |
| Clasificación incorrecta (`records` vs `derived`) | Cada fila incluye owner, class y acción explícita revisable. |
| Falsos positivos del conteo legacy | El delta se documenta como observación del slice, no como criterio de cierre del runtime. |

## notes

- Documento auxiliar de `f00513`, consolidado aquí para no duplicar ids ni crear un segundo proposal fantasma bajo `ready/chores`.