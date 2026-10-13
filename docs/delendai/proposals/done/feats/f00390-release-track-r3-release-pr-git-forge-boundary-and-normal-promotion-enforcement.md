---
id: f00390
title: "Release track R3: release PR, git-forge boundary and normal-promotion enforcement"
kind: feat
status: done
type: proposal
track: general
date: 2026-08-30
related:
  - q00013 # master coordination plan
shipped-in: ["5cb9433f2"]
last-transition-id: a485b5c9-eec9-45eb-94b1-7e58c691f218
last-correlation-id: a485b5c9-eec9-45eb-94b1-7e58c691f218
last-transition-from: review
---

# f00390 — Release track R3: release PR, git-forge boundary and normal-promotion enforcement

## Goal

RELEASE TRACK — reservado exclusivamente a release-migration-agent; plan-execution-orchestrator excluido. Problema/evidencia: PR #50 fue develop -> main y quedó obsoleto mientras develop avanzaba; el nuevo flujo debe impedirlo como promoción normal. Objetivo: release PR high-level idempotente desde release/{patch|minor|major}/{slug} hacia main, validando current branch, upstream, metadata, type, gates, generated drift, source/base SHA, duplicate PR y descripción derivada sin inventar datos. Diseño: core mantiene contratos; git posee branch/local workflow; forge posee PR remoto GitHub/GitLab/self-hosted; commit-policy bloquea develop -> main salvo emergency bypass explícito, auditable y con reason. Alternativas: dos implementaciones GitHub o merge silencioso, ambas descartadas. Contratos/files esperados: plugins/git, plugins/forge, plugins/commit-policy, core contracts, tests/docs. Dependencias: f00389 R2. Compatibility/migration: adaptar configuración de forge y ramas remotas existente; no duplicar adapters. Tests: branch/base checks, duplicate PR idempotency, generated drift, missing upstream, emergency bypass reason. Security: protected main, no force push, explicit approval. Token impact: status/PR body compactos derivados. CI impact: release checks y policy gate. Multiagent impact: worktree obligatorio y provenance de actor. Rollback: cerrar PR sin merge y abort candidate. Observability: PR number, branch, base/source SHAs, gates and policy decisions. Acceptance/DoD: solo release/* -> main normal, PR idempotente, description complete, no duplicate GitHub implementation. Parallelizable: no con R4 en same boundary. Reviewer: release/governance specialist. Related: q00013, f00388, f00389.

## why

La frontera remota y la policy deben convertir el modelo de release en una operación segura y repetible.

## non-goals

- No mergear automáticamente.
- No borrar develop.
- No implementar un segundo adapter específico de GitHub.

## Slices

- global_gate: e2e

### S1 — Release PR creation and promotion policy
- **Status**: done
- **Files**: `plugins/git/src/lib/release-pr`, `plugins/forge/src/lib/release-pr`, `plugins/commit-policy/src/lib/branch-policy`, `plugins/git/tests/release-pr`, `plugins/forge/tests/release-pr`
- **Gate**: e2e
- acceptance:
  - "Solo release/* -> main en flujo normal"
  - "PR idempotente y sin duplicados"
  - "metadata y gates validados"
  - "emergency bypass exige reason y receipt"
  - "adapters provider-specific no se duplican"
- review-state: done
- review-implementer: release-r3-s1
- review-reviewer: delivery-verifier-independent-r3
- review-log: requested_changes by delivery-verifier-r3 — Corregir Forge: invocar assertReleaseMetadata sobre candidate antes de crear/listar PR; validar que la respuesta de provider.createPullRequest tenga headBranch igual a candidate.branch y baseBranch exactamente main; añadir error estructurado missing-upstream coherente con Git; cubrir metadata inválida y provider que devuelve base incorrecta en tests.
- review-log: approved by delivery-verifier-independent-r3 — PASS: Forge valida assertReleaseMetadata(candidate) antes de cualquier llamada al provider; la respuesta de createPullRequest exige headBranch === candidate.branch y baseBranch === main mediante provider-contract; upstream ausente produce missing-upstream estructurado. Tests cubren metadata invalida antes del provider y provider con base incorrecta. Git mantiene branch/base/upstream checks y commit-policy mantiene develop->main bloqueado en normal y bypass de emergencia con reason, capability y receipt. El commit revisado es 5cb9433f; no hay cambios locales en el alcance.
## acceptance

- Solo release/* -> main en flujo normal
- PR idempotente y sin duplicados
- metadata y gates validados
- emergency bypass exige reason y receipt
- adapters provider-specific no se duplican
