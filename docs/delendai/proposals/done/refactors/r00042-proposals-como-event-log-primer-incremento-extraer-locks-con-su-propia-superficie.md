---
id: r00042
title: "`proposals` como event log — primer incremento: extraer `locks/` con su propia superficie"
kind: refactor
status: done
type: proposal
track: architecture
date: 2026-08-29
parent-plan: q00011
audit-source:
    file: docs/delendai/audits/2026-08-27-develop-independent-audit-claude-opus5.md
    finding: AUD-E05
    snapshot: 2cf17373f32b536e0c5154892ceddbb5d490ab37
priority: P2
related: [q00011, f00278, f00279]
last-transition-id: fcd09346-de39-4913-9851-23dffe9c99b3
last-correlation-id: fcd09346-de39-4913-9851-23dffe9c99b3
last-transition-from: in-progress
---

# r00042 — `proposals` como event log — primer incremento: extraer `locks/` con su propia superficie

## Goal

Reducir la concentración de complejidad de `plugins/proposals`
empezando por extraer `locks/agent-lock-engine.ts` (1.262 líneas) a un
paquete interno con su propia superficie y tests, y sentar el patrón
de `transitionId`/`idempotencyKey` en las transiciones mutadoras que
ya existen — sin construir el event log completo de un solo golpe.

## why

**Verificación de la premisa.** Recontado en esta sesión (la snapshot
auditada puede haber cambiado): `find plugins/proposals -name "*.ts" |
grep -v spec | xargs wc -l` da **331 ficheros, 46.417 líneas** de
código no-test — más que las 37.167 líneas que cita la auditoría, lo
que confirma que la tendencia sigue creciendo, no se ha estabilizado.
`locks/agent-lock-engine.ts`, `tools/authoring.tool.ts` (1.654 líneas)
y `tools/auto-work.tool.ts` (1.230 líneas) siguen siendo los ficheros
más grandes del plugin, consistente con el hallazgo.

**Por qué es un problema.** No es el tamaño en sí — `proposals` tiene
135 specs y una profundidad de pruebas de concurrencia notable — sino
que es exactamente donde el ciclo de vida y la política cambian más
(evidencia empírica: los hallazgos de `AUD-A02`/`A03` que ya se
resolvieron por `#49` vivían en este mismo plugin), y por tanto donde
una divergencia semántica puede esconderse más tiempo que en un
módulo estable.

## why this design

Se descarta construir el `EventLog → StateMachine → Transitions →
Effects → Projections` completo como una sola propuesta: la propia
auditoría lo marca como "posterior a los P0" y el `q00011` explícitamente
prohíbe "refactors preventivos grandes… con fusionar sin datos de uso
es adivinar" para hotspots como éste. En su lugar, esta propuesta
extrae **una** pieza ya bien delimitada —`locks/`— porque:

1. Tiene una interfaz de entrada/salida ya clara (adquirir/liberar
   lock por `proposalId-sliceId`), consistente con el `x00157` ya
   corregido sobre este mismo módulo.
2. Es el motor de colas y detección de bucles citado por la propia
   auditoría como candidato de extracción mínima.
3. Extraerlo primero valida el patrón (paquete interno + superficie
   propia + tests propios) con el módulo de menor superficie pública
   antes de tocar `authoring.tool.ts` o `auto-work.tool.ts`, que son
   mucho más grandes y con más dependientes.

`transitionId`/`idempotencyKey` se añaden en paralelo (S2) porque son
aditivos sobre las transiciones existentes — no requieren mover
ficheros — y sientan la base de datos que el event-sourcing completo
necesitaría, permitiendo medir su valor (detectar reintentos
duplicados hoy invisibles) antes de comprometerse al resto de la
arquitectura ideal.

## non-goals

- Construir el `Proposal Event Log` completo con proyecciones y
  *workflow front doors* — es la "solución arquitectónica ideal" de
  `AUD-E05`; esta propuesta es un primer incremento explícito, no una
  implementación parcial de ese diseño final.
- Reducir las 26 tools MCP del plugin — depende de que existan
  *workflow front doors* (fuera de alcance aquí) que orquesten varias
  tools como una sola; no se retiran tools en esta propuesta.
- Extraer `authoring.tool.ts` o `auto-work.tool.ts` — quedan como
  candidatos de un incremento de seguimiento una vez que el patrón de
  extracción de `locks/` esté validado en producción.
- Tocar la máquina de estados de `proposal_transition` para las
  categorías de reglas de `f00279` (completion gates) — son
  propuestas relacionadas pero independientes; ésta sólo prepara el
  terreno con `transitionId`/`idempotencyKey`.

## architecture

```
plugins/proposals/src/lib/locks/agent-lock-engine.ts (1.262 líneas, hoy)
                    │
                    ▼
plugins/proposals-locks/  (paquete interno nuevo, o
                            plugins/proposals/src/lib/locks/ como
                            módulo con su propio public/index.ts +
                            tests/ propios si no se justifica un
                            paquete workspace separado)
      - engine.ts
      - public/index.ts   (superficie explícita: acquire/release/list)
      - tests/

plugins/proposals/src/lib/tools/*.tool.ts
      transitionId, correlationId, idempotencyKey
      añadidos a cada transición mutadora (auditoría, no reescritura)
```

## slices

### S1 — Extraer `locks/agent-lock-engine.ts` con superficie pública explícita

- **Status**: done (verified 2026-09-02: `agent-lock-engine.ts` is now a 24-line compat re-export from `engine.ts`; `public/index.ts` exposes the explicit surface; `bunx vitest run plugins/proposals/tests/src/lib/locks` → 9 files / 73 tests pass)
- **Files**:
    - `plugins/proposals/src/lib/locks/agent-lock-engine.ts` (dividir
      en `engine.ts` + `public/index.ts` dentro del mismo directorio,
      o mover a un paquete interno si el análisis de dependientes en
      S0 muestra que vale la pena — decidir con
      `grep -rln "agent-lock-engine" plugins/proposals/src plugins/proposals/tests`
      antes de mover)
    - `plugins/proposals/tests/src/lib/locks/agent-lock-engine.spec.ts`
      (ya existe — no debe romperse; puede necesitar actualizar
      imports)
- **Gate**: `bunx vitest run plugins/proposals/tests/src/lib/locks`

### S2 — `transitionId`/`correlationId`/`idempotencyKey` en las transiciones mutadoras

- **Status**: done (verified 2026-09-02: `proposal-transition.tool.ts` reads/generates all three fields and persists them to frontmatter; `proposal-transition.idempotency.spec.ts` → 3/3 pass)
- **Files**:
    - `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`
    - `plugins/proposals/src/lib/contracts/proposal-view.contract.ts`
      (o el contrato equivalente donde se tipe el resultado de una
      transición)
    - `plugins/proposals/tests/src/lib/tools/proposal-transition.idempotency.spec.ts` (nuevo)
- **Gate**: `bunx vitest run plugins/proposals/tests/src/lib/tools/proposal-transition.idempotency.spec.ts`

### S3 — Ningún fichero de `locks/` supera 600 líneas tras la extracción

- **Status**: done
- **Files**:
    - los ficheros resultantes de S1 (`engine.ts`, `public/index.ts`,
      y cualquier módulo auxiliar que la partición requiera)
    - `tools/scripts/lint/proposals-locks-file-size.script.ts` (nuevo,
      o extender un lint de tamaño de fichero existente si ya hay uno
      genérico — confirmar con
      `find tools/scripts/lint -iname "*file-size*" -o -iname "*line*"`)
- **Gate**: `bun tools/scripts/lint/proposals-locks-file-size.script.ts`
- review-state: done
- review-implementer: claude-opus-5
- review-reviewer: sonnet-delivery-verifier
- review-log: approved by sonnet-delivery-verifier — Verificado con diff linea a linea sobre las seis funciones de mayor riesgo (runAgentLockEngine, executeLockAction, maybeEscalateContention, readSynchronizedLock, writeLockWithMutex, coerceTable): ninguna condicion, argumento ni await cambio; las unicas diferencias son la palabra export y el accesor documentado. La superficie publica es identica: agent-lock-engine.ts reexporta los mismos 19 nombres y file-lock-table.ts solo anadio exports, nunca quito. lastSessionWorkspaceRoot tiene un unico duenno y ambos call sites pasan por los accesores. El gate se comprobo por inversion: al inflar execute-lock-action.ts a 1166 lineas fallo correctamente, y se reverti. 157 ficheros y 1400 tests en verde. Un unico hallazgo, ya corregido por el implementador: una declaracion muerta en release-audit.ts.
## dependency graph

Posterior a los P0 del plan, como marca la propia auditoría. Se
relaciona con `f00278` (completion gates) y `f00279` (taxonomía de
reglas) porque ambas construyen sobre la máquina de estados de
`proposal_transition` — el `idempotencyKey` de S2 es la primitiva que
esas dos propuestas necesitarían para que un completion-gate no se
evalúe dos veces sobre el mismo intento. Dentro de esta propuesta: S1
es independiente; S2 es independiente de S1 (toca otro fichero); S3
depende de S1 (mide el resultado de la extracción).

## acceptance

- `locks/` tiene una superficie pública explícita (`public/index.ts`
  o equivalente) separada de su implementación interna.
- Ningún fichero de `locks/` supera 600 líneas tras S1.
- Una transición repetida con el mismo `idempotencyKey` no duplica su
  efecto (spec de S2).
- Los 135 specs existentes de `proposals` siguen en verde tras la
  extracción (regresión, no sólo los specs nuevos).

## risks and mitigations

- **Riesgo: mover `agent-lock-engine.ts` reintroduce el bug de
  `x00157` (release por `sliceId` bare en vez de
  `proposalId-sliceId`) si la extracción no preserva el contrato
  exacto.** Mitigación: S1 no reescribe la lógica, sólo reubica el
  fichero y expone una superficie explícita; el spec existente de
  `agent-lock-engine.spec.ts` debe pasar sin modificar sus
  aserciones, sólo sus imports.
- **Riesgo: `idempotencyKey` añadido sin que ningún llamante lo genere
  todavía es una superficie inerte (como `AUD-C02`).** Mitigación: el
  spec de S2 exige explícitamente que una transición SIN
  `idempotencyKey` siga funcionando (retrocompatible) y que una CON
  `idempotencyKey` repetida sea detectable — no basta con que el
  campo exista en el tipo.

## notes

Esta propuesta es deliberadamente el primer incremento, no el diseño
final de `AUD-E05`. El recuento de líneas en esta sesión (46.417,
frente a las 37.167 citadas) confirma que el plugin sigue creciendo
más rápido de lo que se está podando — motivo de más para empezar la
extracción ahora con la pieza de menor riesgo en vez de esperar a
diseñar el event log completo.

### 2026-09-02 — S1/S2 verified genuinely done; S3 blocked, not attempted

Re-verified S1 and S2 against real behavior rather than trusting file
presence:

- S1: `plugins/proposals/src/lib/locks/agent-lock-engine.ts` is a
  24-line re-export from `engine.ts` (compat, per the S1 risk
  mitigation against re-triggering `x00157`); `public/index.ts`
  re-exports the same explicit surface. `bunx vitest run
  plugins/proposals/tests/src/lib/locks` → 9 files, 73 tests, all
  passing.
- S2: `proposal-transition.tool.ts` accepts optional
  `transitionId`/`correlationId`/`idempotencyKey`, generates
  `transitionId` (and derives `correlationId` from it) when omitted,
  and persists all three to frontmatter.
  `proposal-transition.idempotency.spec.ts` → 3/3 passing, including
  the required backward-compatible-without-the-field case.

S3 is genuinely not done and was not attempted: `engine.ts` is 1,394
lines, more than double the 600-line ceiling this slice sets, and no
file-size lint exists yet anywhere in `tools/scripts/lint/`. Splitting
a 1,394-line, concurrency-sensitive lock engine (this exact file has a
documented history of subtle correctness bugs — see the repo's
`x00157` release-by-bare-`sliceId` incident and the "Agent-lock
re-claim drops files" postmortem) into ≤600-line modules is a real
internal refactor, not a mechanical move: it requires understanding
which functions form cohesive units before splitting, and the existing
73 specs — while a good regression net — are not a substitute for a
full `bun run validate` pass, which this session could not start
(rule 3: the orchestrator's validate run was already in flight).
Attempting the split blind and shipping it un-validated would be
exactly the "automated refactor drops logic outside its scope" failure
mode this session was warned about. Left `engine.ts` unsplit and did
not add the file-size lint (adding a lint that immediately fails
against `engine.ts` and is not wired into `validate` would be dead
weight; wiring it in while red would break the shared gate for every
other agent). S3 stays `pending`.

### 2026-09-04 — S3 done; the 2026-09-02 blocker no longer applied

The block was procedural, not technical: the previous session could not
start `bun run validate` because the orchestrator's run was already in
flight, and it declined — correctly — to ship an unvalidated split of a
concurrency-sensitive file. That constraint is gone.

The split was done under one rule: **move declarations, never edit them.**
`engine.ts` went 1,394 → 217 lines across nine modules
(`session-balance`, `lock-paths`, `tmp-file-sweeper`, `lock-store`,
`contention-escalation`, `release-audit`, `lock-lifecycle`, `lock-args`,
`claim-with-file-locks`, `execute-lock-action`), and `file-lock-table.ts`
745 → 556 across two (`file-lock-contentions`, `file-lock-document`). The
types moved to `contracts/interfaces/agent-lock.interface.ts`, which the
repo's own `types-in-contracts` convention wanted anyway.

`engine.ts` re-exports every symbol it used to export, so not one importer
changed — and that promise is only safe to make BECAUSE nothing was
rewritten.

One shape change was forced and is worth recording:
`lastSessionWorkspaceRoot` is module-level mutable state, and an import
binding is read-only, so it cannot cross a module boundary as a value. It
now lives in `session-balance` behind `getLastSessionWorkspaceRoot` /
`setLastSessionWorkspaceRoot`. The alternative was keeping the whole
session-balance group in the engine because of one `let`.

The gate is a hard limit rather than a ratchet, deliberately: it starts
satisfied, so there is no inherited debt to grandfather, and a baseline
would only be somewhere for the next 900-line file to hide.

Review found one leftover the split dragged along: an unused
`let lastSessionWorkspaceRoot` in `release-audit.ts`, a copy-paste
artefact of the module boundary. Provably never read or written, so it
never created a second source of truth — but it touched the one variable
this refactor flagged as highest-risk, which is precisely where a stray
declaration should not be left lying. Removed. The counts in this note
were also off by a line or two and now read 217 and 556.
