---
id: f00393
title: "Release track R1: contracts, branch cut, SemVer and immutable candidate state"
kind: feat
status: ready
type: proposal
track: general
date: 2026-08-30
related:
  - q00013 # master coordination plan
---

# f00393 — Release track R1: contracts, branch cut, SemVer and immutable candidate state

## Goal

RELEASE TRACK — ownership exclusivo y reservado a release-migration-agent; plan-execution-orchestrator no puede reclamarlo. Problema/evidencia: el PR #50 develop -> main fue cerrado sin merge el 30 de agosto de 2026 porque develop es un journal móvil; provenance: head SHA 1d259fc718b5ddf70c44d22a832eb0a595cf9310, base main SHA 0a2ed223838372c15501bf5c6c2e43fce6640338. Objetivo: contratos core forge-agnostic y cut inmutable release/{patch|minor|major}/{lowercase-kebab-slug}. Diseño: state machine tipada, metadata con sourceDevelopSha/baseMainSha/fromVersion/targetVersion/type/slug/actor/timestamp/includedProposals/state, SemVer calculado desde main y una sola source of truth para tags/changelog/package lockstep. Alternativas: continuar develop -> main queda descartado; GitHub no entra en core. Contratos/files esperados: packages/core contracts, plugins/git y commit-policy boundaries, tests y docs. Dependencias: cierre PR #50; R1 precede R2-R4. Compatibility/migration: coexistir con versionado actual y documentar migración. Tests: slug, SemVer, metadata, develop avanzando después del cut. Security: no escribir main; expected-state. Token impact: status compacto. CI impact: gate determinista. Multiagent impact: worktree obligatorio, medir semantic conflicts/claims/lock waits/rereads/polls. Rollback: retirar candidate metadata sin tocar main. Observability: receipt con SHAs, versiones y tiempos. Acceptance/DoD: contratos y tests verdes, dryRun/execute definido, documentación derivada. Parallelizable: no con R2 sobre contratos comunes. Reviewer: release/governance specialist. Related: q00013, q00006, q00010.

## why

Hace explícita la frontera congelada de release y elimina la dependencia de un PR develop -> main mutable.

## non-goals

- No crear release PR todavía.
- No modificar main.
- No publicar paquetes.
- No implementar adapters provider-specific dentro del core.

## Slices

- global_gate: type

### S1 — Release contracts and immutable candidate cut
- **Status**: done
- **Files**: `packages/core/src/lib/contracts/release`, `plugins/git/src/lib`, `plugins/commit-policy/src/lib`, `packages/core/tests`, `plugins/git/tests`
- **Gate**: type
- acceptance:
  - "State machine tipada"
  - "SemVer desde versión real de main"
  - "slug y branch naming validados"
  - "source/base SHA preservados"
  - "tests de inmutabilidad respecto a develop"
- review-state: done
- review-implementer: release-migration-agent
- review-reviewer: release-r1-reviewer
- review-log: requested_changes by delivery-verifier — R1 necesita dos correcciones: assertReleaseMetadata debe validar coherencia branch/type/slug y que targetVersion sea nextVersion(fromVersion,type), además de validar campos relevantes; createReleaseCandidate debe leer main:packages/core/package.json anclado al baseMainSha capturado, no a la referencia móvil main. Tests focalizados deben cubrir ambas carreras/invariantes.
- review-log: approved by release-r1-reviewer — R1 verificado en segunda ronda: metadata coherente, target SemVer derivado de fromVersion/type y lectura de versión anclada al baseMainSha. Exports y tests focalizados correctos.
## acceptance

- State machine tipada
- SemVer desde versión real de main
- slug y branch naming validados
- source/base SHA preservados
- tests de inmutabilidad respecto a develop
