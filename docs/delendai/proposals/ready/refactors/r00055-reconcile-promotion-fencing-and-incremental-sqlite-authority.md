---
id: r00055
title: "Reconcile promotion fencing and incremental SQLite authority"
kind: refactor
status: ready
type: proposal
track: architecture
date: 2026-09-08
---

# r00055 — Reconcile promotion fencing and incremental SQLite authority

## Goal

Hacer que reconcile sea seguro frente a snapshots obsoletos, desapariciones clasificadas y ejecución incremental real sobre SQLite.

## why

`applyValidatedCandidate()` valida bien lo que puede ver: `integrity_check`,
`foreign_key_check`, el estado de la reconciliación shadow y el digest lógico.
Después escribe dentro de una única transacción `BEGIN IMMEDIATE`, que serializa
a los escritores. Eso es correcto y hay que conservarlo.

Lo que no puede detectar es la obsolescencia:

```
T0  staging se construye desde el commit X
T1  otro agente muta una proposal en active  → active avanza
T2  se promociona la staging construida en T0
```

`BEGIN IMMEDIATE` impide que T1 y T2 escriban a la vez. No sabe que T2 está
aplicando una fotografía anterior a T1. Sin una generación esperada, la
promoción pisa en silencio el trabajo de T1 — y lo hace pasando todas las
validaciones, porque la staging es internamente coherente. Es un caso de
lost update clásico, no un fallo de integridad.

El segundo agujero es simétrico. La promoción recorre las filas que existen en
staging y hace upsert de cada una. Nunca mira las filas que existen en active y
han dejado de aparecer en la fuente: de hecho registra `entities_deleted = 0`
siempre. Una proposal borrada, renombrada o movida en Git deja su fila anterior
viva e indistinguible de una real. La infraestructura de tombstones ya existe;
lo que falta es usarla desde la reconciliación, y clasificar la desaparición
(borrado / movimiento / corrupción) en vez de hacer un DELETE físico.

El tercero bloquea directamente el calendario del cutover. `reconcile()` con
`mode: 'incremental'` produce candidatos vía `reconcileProposalMarkdown()` pero
no escribe la base active. El mes de soak que r00049 exige antes de eliminar el
legacy se cuenta sobre ejecución incremental real; mientras `incremental` no
tenga semántica operacional, ese reloj no puede ni empezar.

Las tres son condiciones previas al cambio de autoridad, no mejoras. Mientras
falten, una base que responde a las tools puede perder escrituras concurrentes
y servir entidades que ya no existen, y ninguna de las dos cosas es tolerable
en la fuente operacional. El gate `sqlite-cutover-ready` nombra esta proposal
entre las propiedades que no verifica (ver x00537 S2).

## non-goals

- No cambiar aún todos los read paths del plugin; eso pertenece a r00049.
- No eliminar INDEX.json ni Markdown.
- No migrar todavía el swarm state completo al State Engine.

## Slices

- global_gate: none

### S1 — Fencing, desapariciones clasificadas e incremental reconcile
- **Status**: pending
- **Files**: `packages/proposals-sqlite/src/lib/reconciler-apply-candidate.ts`, `packages/proposals-sqlite/src/lib/reconciler-staging.ts`, `packages/proposals-sqlite/src/lib/reconciler.ts`, `packages/proposals-sqlite/src/lib/repository/tombstones-repo.ts`, `packages/proposals-sqlite/tests/src/lib/reconciler-apply-candidate.spec.ts`, `packages/proposals-sqlite/tests/e2e/incremental-reconcile.spec.ts`
- **Gate**: e2e
- acceptance:
  - "Una staging creada desde generation/source commit G sólo se promociona si active sigue en G."
  - "Una active avanzada rechaza la promoción con stale-generation sin modificar filas."
  - "Una entidad ausente en staging recibe una clasificación explícita tombstone/quarantine/retire y no queda viva silenciosamente."
  - "mode incremental aplica cambios a active SQLite, es idempotente y no duplica lifecycle/outbox."
  - "integrity_check y foreign_key_check siguen en ok."

## acceptance

- Una staging creada desde generation/source commit G sólo se promociona si active sigue en G.
- Una active avanzada rechaza la promoción con stale-generation sin modificar filas.
- Una entidad ausente en staging recibe una clasificación explícita tombstone/quarantine/retire y no queda viva silenciosamente.
- mode incremental aplica cambios a active SQLite, es idempotente y no duplica lifecycle/outbox.
- integrity_check y foreign_key_check siguen en ok.
