---
id: f00417
title: "Commit-policy: causalidad estricta slice→files, sin replay al arrancar, outcomes terminales persistidos"
kind: fix
status: ready
type: proposal
track: quality
date: 2026-09-02
---

# f00417 — Commit-policy: causalidad estricta slice→files, sin replay al arrancar, outcomes terminales persistidos

## Goal

Convertir tres invariantes del commit-policy engine en código no-desactivable:

1. **Causalidad**: un evento `slice` SOLO puede committear ficheros ⊆ `sliceContext.files`. La configuración `sliceScoping`/`allowForeignChanges` deja de controlar este camino; el knob permanece para `manual`/`interval`/`threshold` únicamente.
2. **Sin replay histórico**: cuando el listener arranca y el `index.json` no estaba disponible en el primer poll, el segundo poll NO difunde las slices done existentes como transiciones nuevas. El primer poll válido es la baseline silenciosa.
3. **Outcomes terminales persistidos**: `WORKSPACE_HAS_NO_FILES`, `NO_CHANGE` y otros outcomes no-error se graban en el processed-events store con la misma fuerza que un commit. Un evento terminal no se reintenta nunca; un `RETRYABLE_ERROR` sigue reintentándose hasta agotar la budget.

## why

El 2026-09-02 a las 21:39–21:45 CEST se observaron 83 eventos `slice` con `WORKSPACE_HAS_NO_FILES` y tres commits donde el mensaje decía "feat(f00392)" / "feat(a00062)" / "feat(a00061)" pero los ficheros staged eran `docs/mcp-vertex/proposals/done/refactors/r00033-envelopes-compartidos-entityref-operationresult.md` en los tres casos. El sistema estaba atribuyendo trabajo de un proposal (r00033) a eventos generados para proposals distintos (f00392, a00062, a00061).

Mecánica observada:

1. El slice trigger (`cadence.sliceScoping: false`, `allowForeignChanges: true`) hace que cuando un evento slice llega, el engine compute `allowList = gitDirtyFilePaths()` en lugar de `sliceContext.files`. Cuando el árbol está limpio, devuelve `[]` y emite `WORKSPACE_HAS_NO_FILES`. El listener retiene el evento como pending.
2. Cualquier cambio unrelated que aparezca después en el árbol hace que el próximo poll ejecute el pending, capture esos ficheros y los atribuya al proposal original.
3. Simultáneamente, el listener arranca antes de que el `index.json` exista (MCP arranca antes que el sync de proposals). El primer poll devuelve `[]`. El segundo poll hace `diffSlices(empty, fullIndex)` → todas las slices done parecen transiciones nuevas, generando una tormenta de replay.

El procesado-events store solo escribe en commits exitosos (`engine.ts:533-534`), así que los outcomes NO_CHANGE/WORKSPACE_HAS_NO_FILES nunca se graban y el evento sigue pending indefinidamente.

Resultado: el workspace mutable compartido + el listener que deduce eventos de snapshots + la idempotencia incompleta forman un sistema donde cualquier cambio de un agente puede ser absorbido por el commit de otro. Esto es **memory poisoning generado por el runtime**: si la capa de aprendizaje persiste atribuye el commit al proposal equivocado, las métricas y la reputación de los agentes se contaminan.

## non-goals

- **NO** introduce outbox/journal de transiciones (eso es r00042, ya existe como propuesta y va por separado).
- **NO** cambia el modelo de ownership positivo (worktree-por-agente). Eso se activa vía `agentWorktree: true` en `mcp-vertex.config.json` cuando esto aterrice.
- **NO** redefine la API pública del plugin `commit-policy` ni rompe backward compatibility para `manual`/`interval`/`threshold`.
- **NO** modifica el procesado-events store para TTL/locking — solo extiende la superficie `recordTerminal`.
- **NO** toca el listener de `proposals/` ni el formato de `index.json`.

## Slices

- global_gate: lint, types, test, coverage:ratchet

### S1 — Causalidad estricta en slice events + sin replay al arrancar + outcomes terminales persistidos

- **Status**: pending
- **Files**:
  - `plugins/commit-policy/src/lib/engine.ts` — para `event.kind === 'slice'`, fijar `allowList = event.files` SIEMPRE (independiente de `sliceScoping`/`allowForeignChanges`); el switch queda solo para `manual`/`interval`/`threshold`. Mover `WORKSPACE_HAS_NO_FILES` al cluster de outcomes terminales (no ERR). Aceptar `sliceContext.files.length === 0` como `NO_CHANGE` terminal.
  - `plugins/commit-policy/src/lib/services/commit-driver.ts` — añadir post-stage subset check: si staged paths ⊄ declared files → refusal `CAUSALITY_VIOLATION`. El commit no procede. Loggear WARN estructurado con declared vs attempted.
  - `plugins/commit-policy/src/lib/triggers/slice-listener.ts` — cuando `indexWasUnavailable && !initialized` → `{events: [], refusals: []}`. El primer poll válido nunca es replay.
  - `plugins/commit-policy/src/lib/processed-events.ts` — añadir `recordTerminal(key, outcome, reason?)` que escribe `IProcessedRecord` con `outcome: 'APPLIED' | 'NO_CHANGE' | 'PERMANENT_REFUSAL' | 'CAUSALITY_VIOLATION'`. Mantener `add()` como `recordTerminal(key, 'APPLIED', sha)`. Para `sha` usar `null` cuando no haya commit.
  - `plugins/commit-policy/src/lib/engine.ts` — llamar `recordTerminal` para TODO outcome terminal antes de retornar (`NO_CHANGE`, `CAUSALITY_VIOLATION`, `PERMANENT_REFUSAL`, `APPLIED`).
  - `plugins/commit-policy/src/lib/contracts/i18n-types.ts` — añadir `CAUSALITY_VIOLATION`, `NO_CHANGE`, `PERMANENT_REFUSAL` a `IEngineRefusalCode`.
  - `plugins/commit-policy/tests/src/lib/engine.spec.ts` — añadir specs: slice event con `sliceScoping: false` stages SOLO `event.files`; staged ⊄ declared → refusal CAUSALITY_VIOLATION.
  - `plugins/commit-policy/tests/src/lib/triggers/slice-listener.spec.ts` — añadir spec: index unavailable en primer poll + índice completo en segundo poll → 0 eventos emitidos.
  - `plugins/commit-policy/tests/src/lib/processed-events.spec.ts` — añadir spec: `recordTerminal('k', 'NO_CHANGE')` graba registro con `sha: null, outcome: 'NO_CHANGE'`.
- **Gate**: lint, types, test (todos los existentes + los 3 nuevos)

### S2 — Test de regresión del incidente 2026-09-02 21:39–21:45

- **Status**: pending
- **Files**:
  - `tools/scripts/lint/causality-regression.script.ts` (nuevo) — arranca el listener con index.json faltante; aparece después con 83 slices done; genera dirty `unrelated-r00033.md`; corre engine.handle(); reporta métricas.
  - `tools/scripts/lint/causality-regression.script.spec.ts` (nuevo) — asserts:
    - `historicalEventsEmitted === 0`
    - `unrelatedFileCommitted === false`
    - `commitMessageAttribution !== 'feat(f00392): ...'`
    - `pendingHistoricalQueue === 0`
    - `engineRefusals.filter(CAUSALITY_VIOLATION).length === 1`
    - `processedEvents.recordTerminalCalls.length === 83`
- **Gate**: test

### S3 — Documentar el cambio en `mcp-vertex:AGENT-BOOTSTRAP`

- **Status**: pending
- **Files**: `docs/mcp-vertex/AGENT-BOOTSTRAP.md` — añadir párrafo en §proposals explicando la invariante: "a slice commit is only valid if the staged paths are a subset of the slice's declared files, recorded at the moment the transition was emitted. No configuration disables this."
- **Gate**: lint

## acceptance

- Después de S1+S2 merged:
  1. `bun run validate` verde; `bun vitest run` con todos los specs pasando.
  2. Replay del incidente 2026-09-02 (provocar manualmente las mismas condiciones) produce 0 commits mal atribuidos.
  3. Para slice events, `sliceScoping: false` con `allowForeignChanges: true` ya NO cambia el comportamiento del engine (el camino está forzado a declared files).
  4. Cualquier outcome terminal (incluido NO_CHANGE) está persistido en el store. Re-arrancar el listener con un index completo NO emite eventos históricos.
  5. `bun tools/scripts/lint/causality-regression.script.ts --apply` corre end-to-end y reporta tabla con conteos esperados (historical: 0, committed: 0, NO_CHANGE: ≥ 1, CAUSALITY_VIOLATION: 0).

## Risk

- **R1**: snapshot de los dogfood tests. `dogfood.spec.ts` y `dogfood-branch-policy.spec.ts` configuran explícitamente `sliceScoping: false`. Con S1, el comportamiento para slice events ya no depende de `sliceScoping`. Hay que actualizar esos tests para que prueben: (a) que el camino manual/interval sigue respetando `sliceScoping` (regression guard), (b) que los slice events usan siempre declared files incluso cuando `sliceScoping: false`.
- **R2**: propuestas existentes que dependían del comportamiento permisivo. Tras commit+merge, los agentes en vuelo que ya tenían slices "pending" en el listener con la config antigua deben drenarse manualmente antes de activar la nueva config (re-arrancar MCP vacía el in-memory pending map).
- **R3**: ningún impacto en herramientas manuales (`commit_policy_commit`, `commit_policy_run`, `commit_policy_push`) — siguen aceptando `files` explícitos y los usan verbatim.

## Out of scope (referencias a propuestas separadas)

- Outbox/journal de transiciones → `r00042-proposals-como-event-log-primer-incremento-extraer-locks-con-su-propia-superficie.md` (existe)
- Retry taxonomy con backoff/dead-letter → se cubre en una propuesta `f00418` (siguiente, mismo track)
- Positivo ownership obligatorio (deny-by-default) → se cubre en una propuesta `f00419`
- `agentWorktree: true` por defecto → cambio de config trivial, no requiere propuesta nueva
