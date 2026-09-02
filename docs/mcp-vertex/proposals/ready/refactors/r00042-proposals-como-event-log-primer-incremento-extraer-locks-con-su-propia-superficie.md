---
id: r00042
title: "`proposals` como event log — primer incremento: extraer `locks/` con su propia superficie"
kind: refactor
status: ready
type: proposal
track: architecture
date: 2026-08-29
parent-plan: q00011
audit-source:
    file: docs/mcp-vertex/audits/2026-08-27-develop-independent-audit-claude-opus5.md
    finding: AUD-E05
    snapshot: 2cf17373f32b536e0c5154892ceddbb5d490ab37
priority: P2
related: [q00011, f00278, f00279]
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

- **Status**: blocked — see 2026-09-02 note below
- **Files**:
    - los ficheros resultantes de S1 (`engine.ts`, `public/index.ts`,
      y cualquier módulo auxiliar que la partición requiera)
    - `tools/scripts/lint/proposals-locks-file-size.script.ts` (nuevo,
      o extender un lint de tamaño de fichero existente si ya hay uno
      genérico — confirmar con
      `find tools/scripts/lint -iname "*file-size*" -o -iname "*line*"`)
- **Gate**: `bun tools/scripts/lint/proposals-locks-file-size.script.ts`

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
