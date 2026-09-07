---
id: f00417
title: "Commit-policy: causalidad estricta vía ResolvedCommitScope, sin replay al arrancar, outcomes terminales persistidos, positive ownership ready"
kind: feat
status: ready
type: proposal
track: quality
date: 2026-09-02
---

# f00417 — Commit-policy: causalidad estricta vía ResolvedCommitScope, sin replay al arrancar, outcomes terminales persistidos, positive ownership ready

## Goal

Convertir tres invariantes del commit-policy engine en código no-desactivable:

1. **Causalidad estricta vía ResolvedCommitScope**: un evento `slice` SOLO puede committear ficheros que estén en un `ResolvedCommitScope` calculado por el engine (no `gitDirtyFilePaths()`, no `sliceContext.files` literal). El scope resuelto combina, en este orden:
   - exact-path entries de `sliceContext.files` que sean git paths canónicos;
   - cuando el evento lleve `agentId`/`taskId`, intersección con `positiveOwnership(agentId, taskId)` desde el agent-lock store;
   - entradas que no se puedan resolver (globs, "(or equivalent)", descripciones humanas) se excluyen del scope y se reportan en `unresolvedEntries`. No bloquean el commit; quedan registradas como `WARN` para futura auditoría.
2. **Sin replay histórico**: cuando el listener arranca y el `index.json` no estaba disponible en el primer poll, el segundo poll NO difunde las slices done existentes como transiciones nuevas. El primer poll válido es la baseline silenciosa. `prev = curr` se aplica entonces, sin emitir `diffSlices`.
3. **Outcomes terminales persistidos**: `NO_CHANGE`, `CAUSALITY_VIOLATION`, `PERMANENT_REFUSAL`, `APPLIED` se graban en el processed-events store con la misma fuerza. El listener nunca re-emite un evento terminal.

## why

El 2026-09-02 a las 21:39–22:10 CEST se observaron **decenas de commits slice-driven** donde el mensaje decía un proposalId pero los ficheros staged pertenecían a otro. Ejemplos verificados contra `git show --stat`:

- `44a80bb11` `feat(f00392): commit via slice S3` → `r00033-envelopes-compartidos-entityref-operationresult.md`
- `2d4bef58c` `feat(a00062): commit via slice S1` → mismo `r00033…`
- `83f280b58` `feat(a00061): commit via slice S1` → mismo `r00033…`
- `06f0a2510` `feat(r00019): commit via slice S2` → `…build-un-unico-arbol-sin-dist…`
- `925b19ee2` `feat(a00063): commit via slice S1` → `agent-catalog.generated.json`

Cinco commits distintos, tres proposals distintos, un mismo fichero de un cuarto proposal siendo la "mercancía" cometida bajo el nombre de otro. Esto no es un caso aislado; es el modo de operación normal cuando `sliceScoping:false + allowForeignChanges:true` y un workspace compartido.

**Mecánica del fallo** (verificada en `engine.ts:786-808`, `slice-listener.ts:308-315`, `processed-events.ts:160-180`):

1. El listener arranca antes de que el `index.json` exista → primer poll devuelve `[]`. Segundo poll hace `diffSlices(empty, fullIndex)` → todas las slices done parecen transiciones nuevas → tormenta de replay.
2. El slice trigger, con `sliceScoping:false`, hace que el engine compute `allowList = gitDirtyFilePaths()` en lugar de `sliceContext.files`. Cuando el árbol está limpio, devuelve `[]` → `WORKSPACE_HAS_NO_FILES` → listener retiene el evento pending.
3. Cualquier cambio unrelated posterior → el pending reintenta, captura esos ficheros, los atribuye al proposal original.
4. `processedEvents.add()` solo se ejecuta para commits exitosos. `WORKSPACE_HAS_NO_FILES` nunca se graba → bucle silencioso.

**Por qué `allowList = sliceContext.files` literal tampoco arregla**: el `sliceContext.files` actual contiene strings que NO son git paths canónicos. Hemos visto en logs reales:

```
plugins/proposals/src/lib/proposals/proposal-frontmatter-types.ts` (or equivalent)
- `proposal-document.ts` (nuevo)
[proposal-document.ts](../../../../plugins/proposals/src/lib/proposals/proposal-document.ts)
every `.md` under `docs/delendai/proposals/paused/`
packages/**/*
```

El driver actual apenas normaliza (trim, slashes, renames `old -> new`); no parsea Markdown, ni rechaza "or equivalent", ni expande globs. Usar `sliceContext.files` literal rompería slices legítimas.

## non-goals

- **NO** desactiva `sliceScoping`/`allowForeignChanges` para los caminos `manual`/`interval`/`threshold`. El knob conserva su semántica para esos tres tipos. Solo el camino `event.kind === 'slice'` queda blindado por `ResolvedCommitScope`.
- **NO** cambia el modelo de worktrees por agente (`agentWorktree: true`). Se mantiene desactivado. La estrategia operativa actual es explícitamente: **shared checkout + commits directos a `develop` + estado transitoriamente rojo permitido + settlement posterior**. Worktrees quedan fuera del roadmap próximo.
- **NO** introduce outbox/journal de transiciones (eso es `r00042`).
- **NO** modifica el procesado-events store más allá de añadir `recordTerminal` y la columna `outcome`.
- **NO** cambia el formato de `index.json` ni el listener de `proposals/`.

- Outbox/journal de transiciones → `r00042-proposals-como-event-log-primer-incremento-extraer-locks-con-su-propia-superficie.md` (existe)
- Retry taxonomy con backoff + dead-letter → `f00418` (siguiente, mismo track, draft)
- Eventual settlement (modelo `ACTIVE SWARM → SETTLING → STABLE GREEN`) → `f00419` (siguiente)
- Worktree por agente (`agentWorktree: true`) → **fuera del roadmap próximo**. La estrategia operativa es explícitamente shared checkout.
- Linter que exija paths canónicos en `Files:` para auto-commit → `f00420` (siguiente)

## Slices

- global_gate: lint, types, test, coverage:ratchet

### S1 — `ResolvedCommitScope` + causalidad estricta en slice events

- **Status**: done
- **Files**:
  - `plugins/commit-policy/src/lib/contracts/interfaces/resolved-scope.interface.ts`
  - `plugins/commit-policy/src/lib/services/resolve-scope.ts`
  - `plugins/commit-policy/src/lib/services/agent-lock-positive-ownership.ts`
  - `plugins/commit-policy/src/lib/engine.ts`
  - `plugins/commit-policy/src/lib/services/commit-driver.ts`
- **Gate**: lint, types, test
- review-state: done
- review-implementer: GitHub
- review-reviewer: technical-investigator
- review-log: approved by technical-investigator — Independent review passed. The engine now preserves empty positive ownership through scope resolution, and the regression test proves the exact empty-ownership terminal NO_CHANGE path without relying on lock expiry. Focused validation passed with bunx vitest run plugins/commit-policy/tests/src/lib/engine.spec.ts.
### S2 — Sin replay al arrancar + outcomes terminales persistidos

- **Status**: pending
- **Files**:
  - `plugins/commit-policy/src/lib/triggers/slice-listener.ts`:
    - El branch `indexWasUnavailable` debe devolver `{events:[], refusals:[]}` en el primer poll válido tras la indisponibilidad (línea ~314). El primer poll válido nunca es replay.
    - Añadir un `synthesizeNoChange(event)` para cuando el listener retiene un evento cuyo status sigue siendo on-status pero los `event.files` ya están todos en HEAD o son paths sin cambios. Emite un `NO_CHANGE` terminal.
  - `plugins/commit-policy/src/lib/processed-events.ts` — añadir `recordTerminal(key, outcome: 'NO_CHANGE' | 'PERMANENT_REFUSAL' | 'CAUSALITY_VIOLATION', reason?)` que escribe `IProcessedRecord { key, sha: null, ts, outcome, reason }`. `add()` se mantiene como `recordTerminal(key, 'APPLIED', sha)`.
  - `plugins/commit-policy/src/lib/engine.ts` — llamar `recordTerminal` para TODO outcome terminal antes de retornar (`NO_CHANGE`, `CAUSALITY_VIOLATION`, `PERMANENT_REFUSAL`, `APPLIED`). El listener consulta `processedEvents.has(key)` y nunca re-emite un evento terminal.
- **Gate**: lint, types, test

### S3 — Tests de regresión: shared workspace + chaos concurrente + incidente original

- **Status**: pending
- **Files**:
  - `plugins/commit-policy/tests/src/lib/services/resolve-scope.spec.ts`
  - `plugins/commit-policy/tests/src/e2e/causality-shared-workspace.spec.ts`
  - `plugins/commit-policy/tests/src/e2e/causality-chaos.spec.ts`
  - `tools/scripts/lint/causality-regression.script.ts`
- **Gate**: test

### S4 — Documentar la invariante en `AGENT-BOOTSTRAP`

- **Status**: pending
- **Files**: `docs/delendai/AGENT-BOOTSTRAP.md` — párrafo en §proposals:
  > A slice commit is only valid if the staged paths are a subset of the machine-resolved scope at the moment the transition was emitted. Resolution excludes entries that are not git-path canonical. Foreign dirty files in the workspace MAY coexist; they MUST NOT enter a different slice's commit. No configuration disables this. Terminal outcomes (NO_CHANGE, CAUSALITY_VIOLATION, PERMANENT_REFUSAL) are persisted and never retried.
- **Gate**: lint

## acceptance

- Después de S1+S2+S3+S4 merged:
  1. `bun run validate` verde. `bun vitest run` con todos los specs pasando.
  2. Replay del incidente 2026-09-02 literal (provocado manualmente): 0 commits mal atribuidos; 83 `NO_CHANGE` persistidos.
  3. Para slice events, `sliceScoping: false` con `allowForeignChanges: true` ya NO cambia el comportamiento del engine. La única diferencia observable entre ambas configs es que la permisiva emite WARNs por `foreignDirtyExcluded` (informational).
  4. Manual/interval/threshold siguen usando `sliceScoping`/`allowForeignChanges` como antes (sin regresión).
  5. Tests e2e `causality-shared-workspace` y `causality-chaos` pasan con workspace compartido y 20 commits concurrentes ownership-disjoint.
  6. Cualquier outcome terminal está persistido. Re-arrancar el listener con un index completo NO emite eventos históricos.
  7. `misattributed_commit_count === 0` en métricas post-merge (medible vía `git log --since=<merge> --format=%s`).

## risks and mitigations

- **R1**: dogfood tests configuran `sliceScoping: false` (`dogfood.spec.ts:45`, `dogfood-branch-policy.spec.ts:47`). Con S1, ese flag deja de controlar slice events pero sigue controlando manual/interval/threshold. Hay que actualizar esos tests para: (a) probar que el camino manual/interval sí respeta el flag (regression guard), (b) probar que el camino slice lo ignora y usa ResolvedCommitScope.
- **R2**: propuestas históricas con `Files:` en formato Markdown. Con S1, sus slices se marcan como `NO_CHANGE` y nunca se auto-committean. Esto **es el comportamiento correcto** — eran inútiles como auto-commit anyway. Los agentes que cierren esas slices deben hacerlo vía commit manual o reformatear la sección Files.
- **R3**: el listener retiene pending en memoria. Tras commit+merge, hay que re-arrancar MCP para drenar el in-memory pending map de los eventos `WORKSPACE_HAS_NO_FILES` viejos. La transición es: merge → restart MCP → confirmado via `processed-events.jsonl` que solo aparecen `NO_CHANGE` terminales nuevos.
- **R4**: el `agent-lock-positive-ownership` fail-closed (devuelve `[]` si no puede leer) puede bloquear commits de agentes legítimos durante ventanas de race. Se mitiga con backoff (cubierto en `f00418` retry taxonomy).
