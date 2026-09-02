---
id: q00015
title: "Plan eventual settlement: commits atómicos con scope exacto sobre develop compartido; develop rojo es estado transitorio válido"
kind: plan
status: ready
type: proposal
track: quality
date: 2026-09-02
---

# q00015 — Plan eventual settlement sobre develop compartido

## Goal

Formalizar el modelo operativo que ya está implícito en la decisión de `f00417`:

- **shared checkout + commits directos a `develop`** es la estrategia.
- `develop` puede estar rojo temporalmente (validate fallando) mientras la ronda swarm está activa.
- Cuando `activeWorkers === 0` (o se alcanza un barrier explícito), se lanza una fase de settlement: full validate + repair agent hasta recuperar un stable green HEAD.
- Los foreign dirty files NO bloquean commits ajenos. Solo los commits con paths fuera de su scope resuelto son refusal.

Esta propuesta NO introduce un sistema de settlement nuevo; documenta el contrato y propone los hooks que faltan para que la fase settlement sea automática y verificable.

## why

Una vez que `f00417` aterriza (causalidad estricta + ResolvedCommitScope + positive ownership ready), el swarm puede tener muchos agentes commiteando concurrentemente sin pisarse. Pero `develop` se va a quedar rojo entre rondas porque:

- Cada commit individual puede pasar su propio scope lint pero romper la integración global (cross-package typecheck, lint agregado, test:e2e de toda la suite).
- El sistema actual no tiene barrera: cuando un agente termina, su commit va a `develop` aunque la suite esté rota por commits anteriores.

El modelo **eventual settlement** resuelve esto sin obligar a cada commit a validar todo el repo (lo cual paraliza el swarm). La regla:

```
ACTIVE SWARM (workers > 0)
  commits pueden ser RED
  cada commit atómico y exacto dentro de su ResolvedCommitScope
  push directo a develop

SETTLING (workers == 0 OR barrier)
  pause new work
  full validate (validate-e2e)
  si rojo → repair agent (slice autorizada)
  si verde → stable

STABLE GREEN (HEAD verde)
  punto de partida para la siguiente ronda
```

Es la diferencia entre **eventually consistent** y **strongly consistent**: el sistema converge a verde después de cada ronda, no después de cada commit.

## non-goals

- **NO** introduce worktrees por agente. La decisión es: shared checkout.
- **NO** serializa commits a través de una cola global. Los commits siguen siendo paralelos y atómicos (alcance de `f00417`).
- **NO** reemplaza el sistema de proposals existente. Solo añade una capa de orchestration alrededor.
- **NO** exige que cada slice valide el repo entero antes de committear. Eso sería strongly consistent y mata el swarm.

## Slices

- global_gate: lint, types, test

### S1 — Documentar el contrato del modelo

- **Status**: pending
- **Files**:
  - `docs/mcp-vertex/SHARED-DEVELOP-MODEL.md` (nuevo) — describe los tres estados (ACTIVE/SETTLING/STABLE), las transiciones, los hooks, los agentes responsables (swarm, settlement, repair).
  - `docs/mcp-vertex/AGENT-BOOTSTRAP.md` — añade párrafo en §proposals referenciando este modelo.
- **Gate**: lint

### S2 — Hook de barrera en `commit-policy` (settlement gate)

- **Status**: pending
- **Files**:
  - `plugins/commit-policy/src/lib/settlement/index.ts` (nuevo) — `ISettlementState { phase: 'active'|'settling'|'stable', activeWorkers: number, lastValidateAt?: number, lastGreenHead?: string }`.
  - `plugins/commit-policy/src/lib/settlement/worker-registry.ts` (nuevo) — `registerWorker(agentId, taskId): () => void` (returns disposer). Memoria + persistencia ligera (`.commit-policy/settlement-state.json`).
  - `plugins/commit-policy/src/lib/engine.ts` — antes de aceptar un slice commit en fase `settling`, refusal `SETTLEMENT_IN_PROGRESS` con next action "wait for settle to complete".
  - `plugins/commit-policy/src/lib/tools/settlement-tool.ts` (nuevo) — expone `settlement_status`, `settlement_enter`, `settlement_complete`.
- **Gate**: lint, types, test

### S3 — Settlement runner (`packages/quality-policy`)

- **Status**: pending
- **Files**:
  - `packages/quality-policy/src/lib/settlement-runner.ts` (nuevo) — corre full validate (`bun run validate` + e2e smoke). Loop bounded (max 3 retries). Reporta green HEAD o lista de repair slices necesarias.
  - `packages/quality-policy/src/lib/settlement-state.ts` — consuma el estado del settlement via `commit-policy:settlement_status`.
- **Gate**: lint, types, test

### S4 — Repair agent (autoriza slices para arreglar lo que el validate encontró)

- **Status**: pending
- **Files**:
  - `plugins/proposals/src/lib/auto-work/repair-mode.ts` (nuevo) — modo de `auto_work` que solo propone slices para arreglar errores detectados por el settlement runner. Scope limitado a los archivos en error. Marca la slice como `kind: repair`.
  - `plugins/proposals/src/lib/contracts/constants/proposal-glossary.constant.ts` — añadir `repair` al enum `ProposalKind` si no está.
  - `plugins/proposals/tests/src/lib/auto-work/repair-mode.spec.ts` — coverage del modo restringido.
- **Gate**: lint, types, test

### S5 — E2E test del ciclo completo

- **Status**: pending
- **Files**:
  - `tests/e2e/eventual-settlement.spec.ts` (nuevo) — reproducir:
    1. 3 workers concurrentes commitean A/B/C (cada uno atómico en su scope).
    2. Después del último commit: settlement automático.
    3. validate falla (introducir error intencional en uno de los scopes).
    4. repair agent crea slice autorizada.
    5. settlement retry → verde.
    6. round 2: 2 workers commitean D/E.
- **Gate**: test

## acceptance

- Después de S1+S2+S3+S4+S5 merged:
  1. Mientras `activeWorkers > 0`, commits atómicos a `develop` están permitidos aunque la suite esté roja.
  2. Cuando `activeWorkers === 0`, el settlement runner arranca en ≤5s.
  3. Si validate falla, repair agent genera slices que el swarm puede ejecutar; settlement retry converge en ≤3 rondas.
  4. La transición `settling → stable` es observable vía `commit-policy:settlement_status` y emite un evento `settlement.completed`.
  5. `git log --first-parent --since=<settlement-start>` muestra solo commits de la ronda activos (sin ruido de repair anterior).

## Risk

- **R1**: settlement infinite loop si el repair agent introduce regresiones. Mitigación: `maxRounds = 3`, después escalar a `ESCALATE` (cubierto por `f00418` retry taxonomy).
- **R2**: race entre `worker-registry` writes (varios workers registrando/disponiendo concurrentemente). Mitigación: usar `withFileMutex` (ya existe en core) sobre el fichero de estado.
- **R3**: hooks de barrera consumen un poco de latencia por commit (consulta de estado). Aceptable porque la consulta es local + cache.

## Out of scope

- Commit queueing global (strongly consistent). Explícitamente rechazado: mataría el swarm.
- Per-agent worktree isolation. Explícitamente fuera del roadmap.
- Negative tests para validate (injects failures on purpose). S5 lo cubre de forma contenida.

## Relación con otras propuestas

- `f00417` S1 introduce `positiveOwnership` desde el agent-lock store. Esa es la **infraestructura** sobre la que q00013 S2 (settlement gate) decide si acepta más commits.
- `f00418` (retry taxonomy) provee `DEAD_LETTER` y `ESCALATE`. q00013 R1 depende de eso.
- `r00042` (proposals-como-event-log) es ortogonal: no comparte infra con q00013, pero converge en el modelo de outbox a largo plazo.
