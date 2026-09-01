---
id: r00044
title: "Contract migration, worktree escalation, symlink containment, consent and side-effect transactions"
kind: refactor
status: ready
type: proposal
track: general
date: 2026-08-30
related:
  - q00013 # master coordination plan
shipped-in: ["657398dfb"]
---

# r00044 — Contract migration, worktree escalation, symlink containment, consent and side-effect transactions

## Goal

GENERAL TRACK — owner lógico plan-execution-orchestrator; RELEASE TRACK excluido. Problema/evidencia: la auditoría exige migraciones EXPAND -> PRODUCERS -> REGENERATE -> CONSUMERS -> VERIFY -> CONTRACT; worktrees automáticos por impacto; containment efectivo frente a symlinks; red/error reporting explicit opt-in; y side effects plan -> preview -> approval/policy -> execute -> receipt. Objetivo: convertir invariants de alto fan-out en contracts/policies/tests ejecutables. Diseño: semantic/contract locks solo cuando el fan-out lo justifique; resolver realpath/lstat y TOCTOU; consentimiento fail-closed; transaction envelope con idempotency y expected-state; capability grants integrado con manifests existentes. Alternativas: prose-only skills, containment lexical-only, opt-out reporting y side effects ad hoc; descartadas. Contracts/files esperados: core contracts, security/filesystem, error-reporting, proposals/agent worktree, git/forge adapters, policy plugins, tests/docs. Dependencias: x00323 para gates reproducibles; f00391 para release-specific transaction consumers. Compatibility/migration: expand contracts first, adapters dual-read where required, regenerate artifacts, contract only after verification; skills optional ergonomics. Tests: symlink file/dir/nested/valid/nonexistent/race, network consent default off, transaction preview/approval/idempotency/receipt, capability grants and worktree threshold matrix. Security: fail closed, no user-data reporting, realpath containment, explicit grants. Token impact: compact receipts/handles. CI impact: migration gates and focused tests. Multiagent impact: automatic worktree on high impact; measure semantic conflicts, claims, waits, rereads and polls. Rollback: dual-read/feature flag and transaction abort receipts. Observability: migration epoch, capability decision, containment verdict, consent state, transaction receipt. Acceptance/DoD: protocol and policies enforced mechanically, security tests green, no duplicate skill logic, compatibility documented. Parallelizable: security and migration can run on disjoint files; transaction integration after primitives. Reviewer: security/architecture specialist. Related: q00013, x00323, f00388-f00391. Required sections are represented in this goal and acceptance.

## why

Los cambios de contratos y efectos secundarios son el mayor riesgo de coordinación y seguridad del programa.

## non-goals

- No implementar release-specific behavior fuera del RELEASE TRACK.
- No crear un sistema paralelo de capabilities.
- No convertir todas las lecturas en transacciones.

## Slices

- global_gate: e2e

### S1 — Migration protocol and impact-based worktrees
- **Status**: done
- **Files**: `packages/core/src/lib/contracts`, `plugins/proposals/src/lib/agents`, `plugins/proposals/src/lib/swarm`, `plugins/proposals/tests`
- **Gate**: type
- acceptance:
  - "EXPAND-to-CONTRACT protocol encoded in tools/policies"
  - "worktree escalation matrix tested"
  - "high fan-out changes receive isolation"
- review-state: done
- review-implementer: crow
- review-reviewer: delivery-verifier-r00044-final
- review-log: requested_changes by delivery-verifier-r00044-s1 — La política de migración y la matriz de impacto existen como helpers, pero no están integradas al flujo real de creación de worktrees; además VERIFY no escala cambios de alto impacto. Conectar enforcement y cubrir VERIFY con tests.
- review-log: requested_changes by delivery-verifier-r00044-s1-r2 — El planner integra la guidance, pero el runtime de orchestration/auto-work aún crea worktrees solo por gate global y no consume el verdict de impacto. Añadir enforcement runtime y prueba que VERIFY de alto impacto exige aislamiento.
- review-log: approved by delivery-verifier-r00044-final — Aprobada tras tercera verificación independiente. Runtime de claim/orchestration impide shared checkout para VERIFY/high fan-out; protocolo y matriz integrados. 93/93 tests focalizados pass, validate exit 0, HEAD 8514f99.
### S2 — Symlink containment and network consent
- **Status**: done
- **Files**: `packages/core/src/lib/security`, `plugins/security/src`, `plugins/error-reporting/src`, `plugins/error-reporting/tests`
- **Gate**: e2e
- acceptance:
  - "effective target containment blocks escapes"
  - "reporting defaults fail-closed and explicit opt-in"
  - "adversarial security tests pass"
- review-state: done
- review-implementer: owl
- review-reviewer: delivery-verifier-r00044-s2-final
- review-log: approved by delivery-verifier-r00044-s2-final — Aprobada tras revisión independiente. 128/128 tests focalizados pass, exit code 0, HEAD 8514f99. Containment efectivo y consentimiento fail-closed/opt-in verificados.
### S3 — Side-effect transaction and capability grants
- **Status**: done
- **DependsOn**: [S1, S2]
- **Files**: `packages/core/src/lib/transactions`, `plugins/git/src/lib/transactions`, `plugins/forge/src/lib/transactions`, `plugins/commit-policy/src/lib/capabilities`, `plugins/git/tests/transactions`
- **Gate**: e2e
- acceptance:
  - "plan-preview-approval-execute-receipt lifecycle"
  - "expected-state and idempotency enforced"
  - "capabilities use existing manifests"
- review-state: done
- review-implementer: falcon
- review-reviewer: delivery-verifier-r00044-s3-final
- review-log: approved by delivery-verifier-r00044-s3-final — Cadena approval→execute→receipt auditable: el receipt serializa approver/approvalReceipt/grantedCapabilities, replay reconstruye el approval original y rechaza approval-mismatch. 2/2 tests focales pass, exit code 0, HEAD af2265b.
## acceptance

- EXPAND-to-CONTRACT protocol encoded in tools/policies
- worktree escalation matrix tested
- high fan-out changes receive isolation
- effective target containment blocks escapes
- reporting defaults fail-closed and explicit opt-in
- adversarial security tests pass
- plan-preview-approval-execute-receipt lifecycle
- expected-state and idempotency enforced
- capabilities use existing manifests
