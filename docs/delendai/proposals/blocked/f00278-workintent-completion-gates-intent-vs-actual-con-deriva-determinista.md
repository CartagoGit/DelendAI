---
id: f00278
title: "`WorkIntent` + completion gates: intent vs. actual con deriva determinista"
kind: feat
status: blocked
type: proposal
track: trust
date: 2026-08-29
# Re-orientado 2026-09-06: el bloqueador implícito no era `q00011` sino
# la falta de un projector de progreso que se alimente del bus de eventos.
# `q00020` (`Work Telemetry & Progress Runtime`) lo entrega como `f00510`
# (Progress Projector). Mientras la `phase` no sea inferible a partir de
# eventos baratos, no hay una verdad contra la que comparar el `WorkIntent`
# en la transición a `done`. Cuando `f00510` esté `done`, esta propuesta
# puede declarar su `required_checks[]` apoyándose en las snapshots
# `incremental === cleanRebuild` que el State Engine ya verifica.
parent-plan: q00020
audit-source:
    file: docs/delendai/audits/2026-08-27-develop-independent-audit-claude-opus5.md
    finding: AUD-G02
    snapshot: 2cf17373f32b536e0c5154892ceddbb5d490ab37
priority: P1
related: [q00020, f00277, f00279, f00510]
unblocks-on:
    - id: f00510
      rationale: "Progress Projector: provee la `phase` canónica por `work_item_id` contra la que `compareIntentToActual` mide la deriva."
    - id: f00509
      rationale: "Work Event Bus: provee el stream que `f00510` consume y que `compareIntentToActual` puede volver a leer en el momento de la transición."
---

# f00278 — `WorkIntent` + completion gates: intent vs. actual con deriva determinista

## Goal

Que un agente declare, antes de arrancar, un `WorkIntent` —objetivo,
`proposalId`, `expectedAreas` (globs), `forbiddenAreas`,
`acceptanceCriteria[]`, `requiredChecks[]`— y que el sistema calcule,
sin LLM, `ALIGNED` / `MINOR_DRIFT` / `DRIFTED` / `VIOLATION` comparando
ese intent contra el diff real del worktree (usando la proyección de
`AgentSession` de `f00277`). Y que `proposal_transition` exija esa
comparación en verde antes de permitir el paso a un estado terminal.

## why

**El dolor.** El mismo `AUD-G02`: sin un objetivo declarado, no hay
nada contra lo que comparar un diff, y la supervisión recae
enteramente en la cabeza del autor.

**Verificación de premisas adyacentes.** Confirmado que
`proposal_transition` (`plugins/proposals/src/lib/tools/proposal-transition.tool.ts`,
1.014 líneas) ya tiene mecanismos de gate reales, no un vacío que esta
propuesta llena desde cero: `checkTransitionEvidence` (evidencia de
`validate`), un `slice-completeness gate`, y un gate de
`missing-ci-evidence`/`ci-evidence-sha-mismatch` para
`evidence.commit`/`evidence.ci-runs`. Es decir, el patrón "una
transición exige evidencia verificable antes de aceptar un estado
declarado" **ya existe y está en producción** para CI; esta propuesta
extiende ese mismo patrón para cubrir "¿el diff coincide con lo que se
dijo que se iba a tocar?", que ningún gate actual comprueba.

**Por qué es un problema.** Hoy un agente puede declarar `done` sobre
una proposal habiendo tocado ficheros completamente ajenos a su
alcance declarado, y ningún gate existente lo detecta —los gates
actuales verifican *evidencia de CI*, no *coherencia entre lo pedido y
lo tocado*.

## why this design

Se descarta cualquier verificación basada en juicio de un LLM como
mecanismo principal: comparar globs contra un diff es aritmética, no
juicio, y la propia auditoría lo señala como la ventaja central de
este diseño — determinista y gratis. Un LLM sólo entra (fuera de
alcance de esta propuesta, ver `non-goals`) cuando la comparación
determinista ya detectó `DRIFTED`, como segunda opinión barata, nunca
como el mecanismo de detección en sí.

Se integra el resultado en `proposal_transition` reutilizando su
infraestructura de gates existente (`checkTransitionEvidence` y
hermanos) en lugar de crear un tool paralelo, porque el punto donde
"COMPLETED debe significar algo" ya es exactamente donde viven los
demás gates de evidencia — añadir uno más ahí es coherente con el
patrón, no una superficie nueva que aprender.

## non-goals

- El supervisor con LLM que pregunta "¿es coherente esta deriva?" —
  fuera de alcance; esta propuesta entrega sólo la clasificación
  determinista (`ALIGNED`/`MINOR_DRIFT`/`DRIFTED`/`VIOLATION`). Si se
  decide construir el supervisor, es un incremento de seguimiento que
  consume esta clasificación como entrada.
- La taxonomía completa de reglas guidance/verification/enforcement de
  `f00279` — esta propuesta implementa un `requiredChecks[]` genérico
  (el agente declara qué comandos deben pasar), no la taxonomía en sí;
  `f00279` puede consumir el mecanismo de completion gate que aquí se
  construye para su categoría "verification".
- Bloquear el trabajo **mientras** el agente trabaja — el `WorkIntent`
  se compara sólo en la transición a un estado terminal
  (`ACTIVE → COMPLETED`/`done`), nunca a mitad de sesión; tocar áreas
  fuera de alcance sigue siendo posible durante el trabajo, sólo se
  bloquea declararlo terminado sin resolver la deriva.

## architecture

```
WorkIntent (declarado antes de empezar, vía nueva tool o campo de
            frontmatter en la proposal):
    { proposalId, agentId, expectedAreas: string[] (globs),
      forbiddenAreas: string[], acceptanceCriteria: string[],
      requiredChecks: string[] }

proposal_transition(ACTIVE → done/review):
    1. checkTransitionEvidence (ya existe, sin cambios)
    2. NUEVO: compareIntentToActual(workIntent, agentSessionDiff)
         → matchGlobs(diff.files, expectedAreas)   → aritmética pura
         → matchGlobs(diff.files, forbiddenAreas)  → VIOLATION si hay match
         → runRequiredChecks(requiredChecks)       → shell, exit code
         → clasificación: ALIGNED | MINOR_DRIFT | DRIFTED | VIOLATION
    3. si DRIFTED/VIOLATION y no hay override explícito documentado
       → transición rechazada, mensaje explícito:
         "Cannot complete proposal. 1 unexpected file modified: ..."
```

## slices

### S1 — Contrato `WorkIntent` + declaración por proposal

- **Status**: pending
- **Files**:
    - `plugins/proposals/src/lib/contracts/work-intent.contract.ts` (nuevo)
    - `plugins/proposals/src/lib/tools/declare-work-intent.tool.ts` (nuevo,
      o extender `agent-worktree.tool.ts` si el flujo de arranque de
      worktree es el punto natural de declaración — decidir
      comprobando cómo se invoca hoy `agent-worktree.tool.ts` antes de
      crear un tool nuevo)
    - `plugins/proposals/tests/src/lib/tools/declare-work-intent.spec.ts` (nuevo)
- **Gate**: `bunx vitest run plugins/proposals/tests/src/lib/tools/declare-work-intent.spec.ts`

### S2 — `compareIntentToActual`: comparación determinista de globs

- **Status**: pending
- **Files**:
    - `plugins/proposals/src/lib/services/compare-intent-to-actual.ts` (nuevo)
    - `plugins/proposals/tests/src/lib/services/compare-intent-to-actual.spec.ts` (nuevo,
      casos: 100% dentro de `expectedAreas` → ALIGNED; un fichero
      extra pequeño → MINOR_DRIFT; múltiples fuera de alcance →
      DRIFTED; cualquier fichero en `forbiddenAreas` → VIOLATION)
- **Gate**: `bunx vitest run plugins/proposals/tests/src/lib/services/compare-intent-to-actual.spec.ts`

### S3 — Cablear el completion gate en `proposal_transition`

- **Status**: pending
- **Files**:
    - `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`
      (añadir la llamada a `compareIntentToActual` junto a
      `checkTransitionEvidence`)
    - `plugins/proposals/tests/src/lib/tools/proposal-transition.work-intent-gate.spec.ts` (nuevo)
- **Gate**: `bunx vitest run plugins/proposals/tests/src/lib/tools/proposal-transition.work-intent-gate.spec.ts`

## dependency graph

Depende de `f00277` para la fuente del diff real por worktree
(`AgentSession.modifiedFiles`) — sin esa proyección, S2/S3 tendrían
que reimplementar su propia lectura de git, duplicando trabajo. Se
relaciona con `f00279` (taxonomía de reglas): el completion gate que
aquí se construye es el mecanismo concreto de la categoría
"verification" que esa propuesta describe. Dentro de esta propuesta:
S1 no depende de nada; S2 es independiente de S1 (función pura sobre
tipos, no sobre el tool); S3 depende de S1 y S2.

## acceptance

- Una proposal cuyo `WorkIntent` declara `expectedAreas:
  ["packages/core/src/lib/dry-run/**"]` y cuyo diff real sólo toca esa
  ruta transiciona a `done` sin fricción adicional (`ALIGNED`).
- La misma proposal con un diff que además toca
  `plugins/proposals/**` (fuera de `expectedAreas`) recibe
  `DRIFTED` y la transición se rechaza con un mensaje que nombra el
  fichero inesperado.
- Un diff que toca una ruta en `forbiddenAreas` siempre resulta en
  `VIOLATION`, sin excepción por umbral de "pocos ficheros".
- El mensaje de rechazo enumera cada criterio incumplido, no un
  genérico "gate failed".

## risks and mitigations

- **Riesgo: un agente legítimo necesita tocar un fichero fuera de
  `expectedAreas` por una razón real (p. ej. actualizar un test
  compartido).** Mitigación: `MINOR_DRIFT` (pocos ficheros, no en
  `forbiddenAreas`) no bloquea la transición, sólo la anota — el
  bloqueo estricto es sólo para `DRIFTED`/`VIOLATION`; el umbral entre
  ambos se calibra en S2 y se deja configurable.
- **Riesgo: `WorkIntent` se convierte en papeleo que los agentes
  rellenan sin cuidado (globs demasiado amplios para no chocar
  nunca).** Mitigación: fuera del alcance técnico de esta propuesta,
  pero se documenta en `notes` — el valor del mecanismo depende de que
  `expectedAreas` sea honesto; un lint de calidad de `WorkIntent`
  (p. ej. rechazar `**/*` como único glob) es un endurecimiento de
  seguimiento si se observa el problema en la práctica.

## notes

Esta propuesta reutiliza deliberadamente la infraestructura de gates
que `proposal_transition` ya tiene para CI (`checkTransitionEvidence`)
en vez de construir un mecanismo paralelo — el patrón "una transición
exige evidencia verificable" ya está validado en producción para ese
caso; aquí se extiende a un tipo de evidencia distinto (coherencia
intent↔diff) con el mismo punto de aplicación.
