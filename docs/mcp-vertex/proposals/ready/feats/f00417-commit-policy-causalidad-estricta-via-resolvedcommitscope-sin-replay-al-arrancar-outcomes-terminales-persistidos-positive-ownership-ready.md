---
id: f00417
title: "Commit-policy: causalidad estricta vía ResolvedCommitScope, sin replay al arrancar, outcomes terminales persistidos, positive ownership ready"
kind: fix
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
every `.md` under `docs/mcp-vertex/proposals/paused/`
packages/**/*
```

El driver actual apenas normaliza (trim, slashes, renames `old -> new`); no parsea Markdown, ni rechaza "or equivalent", ni expande globs. Usar `sliceContext.files` literal rompería slices legítimas.

## non-goals

- **NO** desactiva `sliceScoping`/`allowForeignChanges` para los caminos `manual`/`interval`/`threshold`. El knob conserva su semántica para esos tres tipos. Solo el camino `event.kind === 'slice'` queda blindado por `ResolvedCommitScope`.
- **NO** cambia el modelo de worktrees por agente (`agentWorktree: true`). Se mantiene desactivado. La estrategia operativa actual es explícitamente: **shared checkout + commits directos a `develop` + estado transitoriamente rojo permitido + settlement posterior**. Worktrees quedan fuera del roadmap próximo.
- **NO** introduce outbox/journal de transiciones (eso es `r00042`).
- **NO** modifica el procesado-events store más allá de añadir `recordTerminal` y la columna `outcome`.
- **NO** cambia el formato de `index.json` ni el listener de `proposals/`.

## Slices

- global_gate: lint, types, test, coverage:ratchet

### S1 — `ResolvedCommitScope` + causalidad estricta en slice events

- **Status**: pending
- **Files**:
  - `plugins/commit-policy/src/lib/contracts/interfaces/resolved-scope.interface.ts` (nuevo) — `IResolvedCommitScope { proposalId, sliceId, agentId?, taskId?, transitionId?, source: 'declared'|'ownership'|'mixed', files: string[], unresolvedEntries: { raw: string, reason: string }[], foreignDirtyExcluded: string[] }`
  - `plugins/commit-policy/src/lib/services/resolve-scope.ts` (nuevo) — `resolveCommitScope(input): Promise<IResolvedCommitScope>`. Pasos:
    1. Para cada `raw` en `event.files`: classify as `gitPath` (no whitespace, no globs, no markdown link syntax, no `(or equivalent)`) → include; else → `unresolvedEntries`.
    2. Si `agentId`/`taskId` presentes: `getPositiveOwnership(agentId, taskId)` desde agent-lock store → intersectar.
    3. Si el path no está dirty: `foreignDirtyExcluded` (informational, no refusal).
  - `plugins/commit-policy/src/lib/services/agent-lock-positive-ownership.ts` (nuevo) — `getPositiveOwnership(agentId, taskId, rootDir): Promise<string[]>`. Lee `.commit-policy/agent-locks.jsonl`, filtra por agent+task, devuelve paths únicos. Fail-closed: si el lockfile no se puede leer, devuelve `[]` y loggea WARN. NO es fail-open como el provider actual.
  - `plugins/commit-policy/src/lib/engine.ts` — para `event.kind === 'slice'`:
    - `scope = await resolveCommitScope(event)`
    - `allowList = scope.files`
    - Si `allowList.length === 0` y `unresolvedEntries.length > 0` → `NO_CHANGE` (terminal, loggear WARN con unresolved).
    - Si `allowList.length === 0` y `unresolvedEntries.length === 0` → `NO_CHANGE` (evento sin paths útiles; terminal).
    - Si después del subset check post-stage `staged ⊄ scope.files` → `CAUSALITY_VIOLATION` (terminal).
  - `plugins/commit-policy/src/lib/services/commit-driver.ts` — añade post-stage subset check contra el `resolvedScope` que llega como argumento. Refusal: `CAUSALITY_VIOLATION` con detalle `declared: [...], attempted: [...]`.
  - `plugins/commit-policy/src/lib/contracts/i18n-types.ts` — añadir `CAUSALITY_VIOLATION`, `NO_CHANGE`, `PERMANENT_REFUSAL`.
- **Gate**: lint, types, test

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
  - `plugins/commit-policy/tests/src/lib/services/resolve-scope.spec.ts` (nuevo) — coverage:
    - exact-path entries → scope.files
    - markdown link syntax → unresolvedEntries (reason: 'markdown-link')
    - `(or equivalent)` → unresolvedEntries (reason: 'vague-language')
    - glob `**/*` → unresolvedEntries (reason: 'glob')
    - intersección con positive ownership cuando agent+task presentes
    - paths no-dirty → `foreignDirtyExcluded` (no refusal)
  - `plugins/commit-policy/tests/src/e2e/causality-shared-workspace.spec.ts` (nuevo) — el test que define la arquitectura:

```
HEAD H0
A.ts/B.ts/C.ts dirty
ownership(A)={A.ts}, ownership(B)={B.ts}, ownership(C)={C.ts}

commit A → H1, staged=A.ts, B.ts y C.ts dirty intactos
commit B → H2, staged=B.ts, C.ts dirty intacto
commit C → H3, staged=C.ts, workspace clean

assertions:
- H0 → H1 → H2 → H3 lineal
- A.ts en H1, B.ts en H2, C.ts en H3 (nunca mezclados)
- foreign working-tree bytes no modificados por commits ajenos
```

  - `plugins/commit-policy/tests/src/e2e/causality-chaos.spec.ts` (nuevo):

```
20 concurrent commit requests sobre 20 ownership-disjoint files
assertions:
- 20 commits creados
- historia lineal
- no lost update, no mixed commit
- workspace ends clean
```

  - `tools/scripts/lint/causality-regression.script.ts` (nuevo) — replay literal del incidente 2026-09-02: arranca el listener con index.json faltante; aparece después con 83 slices done; genera dirty `unrelated-r00033.md`; corre engine.handle(); reporta tabla con conteos. Specs:
    - `historicalEventsEmitted === 0`
    - `unrelatedFileCommitted === false`
    - `commitMessageAttribution !== 'feat(f00392): …'`
    - `processedEvents.recordTerminalCalls.filter(o => o.outcome === 'NO_CHANGE').length === 83`
- **Gate**: test

### S4 — Documentar la invariante en `AGENT-BOOTSTRAP`

- **Status**: pending
- **Files**: `docs/mcp-vertex/AGENT-BOOTSTRAP.md` — párrafo en §proposals:
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

## Risk

- **R1**: dogfood tests configuran `sliceScoping: false` (`dogfood.spec.ts:45`, `dogfood-branch-policy.spec.ts:47`). Con S1, ese flag deja de controlar slice events pero sigue controlando manual/interval/threshold. Hay que actualizar esos tests para: (a) probar que el camino manual/interval sí respeta el flag (regression guard), (b) probar que el camino slice lo ignora y usa ResolvedCommitScope.
- **R2**: propuestas históricas con `Files:` en formato Markdown. Con S1, sus slices se marcan como `NO_CHANGE` y nunca se auto-committean. Esto **es el comportamiento correcto** — eran inútiles como auto-commit anyway. Los agentes que cierren esas slices deben hacerlo vía commit manual o reformatear la sección Files.
- **R3**: el listener retiene pending en memoria. Tras commit+merge, hay que re-arrancar MCP para drenar el in-memory pending map de los eventos `WORKSPACE_HAS_NO_FILES` viejos. La transición es: merge → restart MCP → confirmado via `processed-events.jsonl` que solo aparecen `NO_CHANGE` terminales nuevos.
- **R4**: el `agent-lock-positive-ownership` fail-closed (devuelve `[]` si no puede leer) puede bloquear commits de agentes legítimos durante ventanas de race. Se mitiga con backoff (cubierto en `f00418` retry taxonomy).

## Out of scope (referencias a propuestas separadas)

- Outbox/journal de transiciones → `r00042-proposals-como-event-log-primer-incremento-extraer-locks-con-su-propia-superficie.md` (existe)
- Retry taxonomy con backoff + dead-letter → `f00418` (siguiente, mismo track, draft)
- Eventual settlement (modelo `ACTIVE SWARM → SETTLING → STABLE GREEN`) → `f00419` (siguiente)
- Worktree por agente (`agentWorktree: true`) → **fuera del roadmap próximo**. La estrategia operativa es explícitamente shared checkout.
- Linter que exija paths canónicos en `Files:` para auto-commit → `f00420` (siguiente)
