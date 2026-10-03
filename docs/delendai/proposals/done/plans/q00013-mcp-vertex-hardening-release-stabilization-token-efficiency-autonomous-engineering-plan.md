---
id: q00013
title: "MCP Vertex Hardening, Release Stabilization, Token Efficiency & Autonomous Engineering Plan"
kind: plan
status: done
type: plan
track: master-hardening-release-stabilization
date: 2026-08-30
related:
  - f00393 # RELEASE TRACK R1, reservado a release-migration-agent
  - f00389 # RELEASE TRACK R2, reservado a release-migration-agent
  - f00390 # RELEASE TRACK R3, reservado a release-migration-agent
  - f00391 # RELEASE TRACK R4, reservado a release-migration-agent
  - r00044 # contract migration, containment, consent and transactions
  - v00133 # schema surface, projections, handles and context cost
  - f00392 # adaptive facade, provenance, generated truth and VS Code benchmark
contains:
  proposals:
    - { id: f00393, kind: feat, required: true, priority: P0, track: release-r1 }
    - { id: f00389, kind: feat, required: true, priority: P0, track: release-r2 }
    - { id: f00390, kind: feat, required: true, priority: P0, track: release-r3 }
    - { id: f00391, kind: feat, required: true, priority: P0, track: release-r4 }
    - { id: r00044, kind: refactor, required: true, priority: P1, track: contracts-security }
    - { id: v00133, kind: perf, required: true, priority: P1, track: tokens-surface }
    - { id: f00392, kind: feat, required: true, priority: P1, track: adaptive-governance }
closureGate:
  requirePeerReview: true
  requireAllSlicesDone: true
  requireAllChildrenDone: true
  requireEvidenceOnClose: true
  requireDevelopGreen: true
globalGate: type
last-transition-id: 815aff29-c63d-4d44-900c-9e044638bf3e
last-correlation-id: 815aff29-c63d-4d44-900c-9e044638bf3e
last-transition-from: review
shipped-in: ["1d9e40cb3"]
---

# q00013 — MCP Vertex Hardening, Release Stabilization, Token Efficiency & Autonomous Engineering Plan

## Goal

Plan maestro de coordinación posterior al cierre sin merge del PR #50 develop -> main. PR #50: https://github.com/CartagoGit/mcp-vertex/pull/50; título release: land GitHub security tools + ReDoS hardening (f00281, x00298); head develop SHA 1d259fc718b5ddf70c44d22a832eb0a595cf9310; base main SHA 0a2ed223838372c15501bf5c6c2e43fce6640338; cerrado el 30 de agosto de 2026 con merged=false. El flujo futuro es release/{patch|minor|major}/{slug} -> main, con cut SHA explícito, expected-state, SemVer, races, state machine, PR idempotente, finalize no silencioso y reconciliación post-merge. RELEASE TRACK R1->R4 queda reservado a release-migration-agent; todos los demás tracks quedan para plan-execution-orchestrator. Baselines actuales: gen:all --check falla por drift en plugins/error-reporting/README.md; bun run validate falla por drift cuantitativo en docs/mcp-vertex/AGENT-BOOTSTRAP.md; vertex 195 tools/266811 B, swarm 165/194010 B, proposals 49703 B. Cobertura: hermetic generators, TS tooling a cero, quality collect, contract migration, worktree escalation, symlink containment, network/error consent, schema measurement, compact/full projection, artifact handles, task context cost, adaptive proposals facade, side-effect transactions, capability grants, provenance graph, generated docs truth, VS Code activation benchmark y adaptive preferred path. DAG: CLOSE PR -> R1 -> R2 -> R3 -> R4 -> general; generators -> TS -> CI; contract migration -> worktree -> transactions; security/network -> transactions; schema -> projection -> handles; schema/projection -> adaptive -> task cost; capabilities/provenance/docs/VS Code en paralelo. Cada child debe documentar problema, evidencia, SHA, objetivo, no objetivos, diseño, alternativas, contratos, files, dependencias, compatibilidad, migración, tests, security, token/CI/multiagent impact, rollback, observabilidad, acceptance, DoD, paralelismo, worktree, reviewer, related y ownership. Plan coordination-only; no implementar fixes ni release tooling ni reclamar children reservadas.

## why

La promoción develop -> main era móvil y obsoleta. El programa necesita una frontera release estable y propuestas ejecutables para los problemas actuales y los objetivos de evolución, con ownership separado y métricas verificables.

## non-goals

- No implementar el programa en esta fase.
- No reabrir ni recrear el PR #50.
- No reclamar propuestas ni modificar runtime.
- No revertir cambios concurrentes.
- No usar baselines históricos como baselines actuales sin medir.

## Slices

- global_gate: type

### S1 — Coordinar árbol completo y validar cierre
- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/done/plans/q00013-mcp-vertex-hardening-release-stabilization-token-efficiency-autonomous-engineering-plan.md`
- **Gate**: none
- acceptance:
  - "PR #50 cerrado sin merge y provenance registrado"
  - "RELEASE TRACK R1-R4 reservado a release-migration-agent"
  - "general executor excluido"
  - "DAG y métricas definidos"
  - "current HEAD revalidado y proposal checks previstos"
- review-state: done
- review-implementer: plan-execution-orchestrator
- review-reviewer: delivery-verifier-q00013-s1-final
- review-log: approved by delivery-verifier-q00013-s1-final — PR #50 sigue cerrado sin merge, RELEASE TRACK reservado al release-migration-agent con agentes activos f00393/f00389/f00390/f00391; el general track cerró r00044/S1-S3, v00133/S1-S1a-S2 y f00392/S1-S3 con revisión independiente; HEAD revalidado en af2265b; metrics disponibles en docs/mcp-vertex/TOKEN-BUDGETS.md (corpus task_context p50/p95 reproducidos).

## acceptance

- PR #50 cerrado sin merge y provenance registrado
- RELEASE TRACK R1-R4 reservado a release-migration-agent
- general executor excluido
- DAG y métricas definidos
- current HEAD revalidado y proposal checks previstos

## notes

RELEASE TRACK, en orden obligatorio y con ownership exclusivo de
`release-migration-agent`:

- `f00393` — R1 contracts, branch cut, SemVer and immutable candidate state
- `f00389` — R2 expected state, races, idempotency and readiness validation
- `f00390` — R3 release PR, git-forge boundary and promotion policy
- `f00391` — R4 finalize, reconciliation, hotfix and end-to-end promotion

Tracks generales, ownership lógico `plan-execution-orchestrator`:

- `x00323` — generators, TypeScript zero and quality collect; actualmente
  `blocked` por una operación concurrente y no reclamable desde este plan
- `r00044` — contract migration, worktree escalation, symlink containment,
  consent and side-effect transactions
- `v00133` — schema surface, compact projection, artifact handles and task
  context cost
- `f00392` — adaptive facade, provenance, generated truth and VS Code benchmark

Children concurrentes preexistentes relacionadas (`q00006`, `q00010`,
`q00011`, `q00012`, `f00387` y el `v00132` ajeno) no se absorben ni se
reescriben. Deben coordinarse por sus propios planes/owners para evitar
duplicación y colisiones de IDs.

-- PR obsoleto: #50, cerrado sin merge el 2026-08-30; no replacement PR creado.
- HEAD inicial medido: `1d259fc718b5ddf70c44d22a832eb0a595cf9310`.
- HEAD concurrente revalidado durante la planificación: `dfd1aca93f3042ab2ead0cbc325c425f046f0bff`.
- Bloqueos conocidos: proposal queue roja, locks/heartbeats concurrentes,
  drift de `gen:all --check`, drift cuantitativo y colisiones de IDs ajenas.
