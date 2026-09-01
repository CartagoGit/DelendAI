---
id: f00395
title: "Release track S5: release/* branch discipline, local pre-push gate and required CI check"
kind: feat
status: done
type: proposal
track: general
date: 2026-08-31
related:
  - q00013 # master coordination plan
  - f00393 # R1 contracts (already approved)
  - f00390 # R3 release PR / forge boundary
shipped-in: ["c0102fbed", "35e229f6"]
last-transition-id: 5262ef6b-8dc6-47f9-9531-609d842f1815
last-correlation-id: 5262ef6b-8dc6-47f9-9531-609d842f1815
last-transition-from: review
---

# f00395 — Release track S5: release/* branch discipline, local pre-push gate and required CI check

## Goal

Cerrar la disciplina de las ramas `release/{patch|minor|major}/{kebab-slug}` con la misma severidad que `main`: detección automática, push discipline local, gate local pre-push, y check obligatorio en CI para PR hacia `main`. Hoy R1–R4 cubren contratos, expected-state, forge-boundary y finalize, pero nada ata el día a día: un humano o agente puede crear `release/foo` y pushear commits sin validar typecheck/lint/Conventional Commits hasta que CI se queje (gastando minutos). Queremos que la rama esté verde **antes** del primer push, y que CI la re-confirme al abrir el PR contra `main`. Compatible con R1–R4: añade una capa de disciplina alrededor, no modifica state machine, contracts ni flows de finalize.

## why

- R3 (f00390) ya exige que la promotion sea por PR a `main`, pero el contrato del lado del cliente (push discipline + local gate) no existe: un agente puede `git push -f` desde `release/*` y romper el flujo.
- El usuario quiere "cualquier commit en `release/*` valide antes de poder pushear", de modo que la rama arranque verde o se arregle en sitio antes del PR.
- Estrategia de merge adoptada: PR `release/* → main`, merge, sync `main → develop` (la "opción A" del resumen). El gate local y el CI deben reflejar exactamente esa frontera.

## non-goals

- No modificar el state machine de release (vive en R1/R2).
- No añadir nuevos publish/adapters de proveedor en core.
- No alterar `push-to-develop-discipline` para `develop` (sigue flexible).
- No añadir otro workflow que ya cubra `quality-gate`/`ci-complete`: este es ortogonal y solo añade el check `release-pr-gate`.

## Slices

- global_gate: type, e2e, policy
- local hooks
- ci workflows
- docs

### S1 — Protected branch resolver + push discipline extended to release/*
- **Status**: done
- **Files**:
  - `plugins/commit-policy/src/lib/contracts/constants/protected-branches.ts`
  - `plugins/commit-policy/tests/src/lib/contracts/constants/protected-branches.spec.ts`
  - `tools/scripts/lint/push-to-develop-discipline.script.ts`
  - `tools/scripts/lint/push-to-develop-discipline.script.spec.ts`
- **Gate**: type, e2e
- **Owner**: implementation-runner
- acceptance:
  - `release/*` queda en el resolver por defecto de ramas protegidas (junto a `main`).
  - `reversePush` desde `main` hacia `release/*` se bloquea con un mensaje claro.
  - `nestedRelease` desde `release/v1` hacia `release/v2` se bloquea (no anida releases).
  - `release → develop` se bloquea (release no debe mergearse a develop directamente; debe ir a main primero y sincronizar).
  - `push desde develop hacia release/*` se permite solo si la rama release ya existe en remoto (worktree merge); bloquea `release/*` local-only porque ya hay protección R1 (cut).
  - Spec extendidos: 4 casos nuevos, todos verdes.
  - Tests focalizados siguen verdes (no regresión en casos existentes).
- review-state: done
- review-implementer: copilot-orchestrator-f00395-s1-verify
- review-reviewer: delivery-verifier-f00395-s1-verify
- review-log: approved by delivery-verifier-f00395-s1-verify — Verified independently: S1 implementation present in HEAD. Protected branch resolver extended to release/*, push discipline lint + spec both pass (5/5).
### S2 — `release-pr-gate` lint script + spec
- **Status**: done
- **Files**:
  - `tools/scripts/lint/release-pr-gate.script.ts`
  - `tools/scripts/lint/release-pr-gate.spec.ts`
- **Gate**: type, e2e
- **Owner**: implementation-runner
- acceptance:
  - Función pura `decideReleaseGate(localRef, remoteRef, opts)` que devuelve `{ ok, blockers, runs }`.
  - Solo se activa cuando `localRef` o `remoteRef` matchea `^release/` o cuando `remoteRef` es `main`.
  - Steps ejecutados: `lintCommitMessage(lastCommit)`, `spawnSync bun run typecheck`, `spawnSync bun run lint` (Biome).
  - Salida compatible con `formatReport`: human-readable en stdout/stderr, exit 0/1.
  - Specs:
    - Sin updates a release/* o main → return 0 sin ejecutar nada.
    - Update con typecheck fallido → bloquea con blocker indicando el step.
    - Update con commit msg no Conventional → bloquea.
    - Update con todo verde → return 0.
    - Update con `currentBranch` no release ni main → return 0 (ignorar).
  - Sin dependencias nuevas en runtime.
- review-state: done
- review-implementer: copilot-orchestrator-f00395-s2-verify
- review-reviewer: delivery-verifier-f00395-s2-verify
- review-log: approved by delivery-verifier-f00395-s2-verify — Verified independently: S2 implementation present in HEAD. release-pr-gate lint script + spec both pass (12/12).
### S3 — Lefthook wiring (release/* pre-push bloqueante)
- **Status**: done
- **Files**:
  - `lefthook.yml`
- **Gate**: policy
- **Owner**: implementation-runner
- acceptance:
  - Nuevo comando `release-pr-gate` en `pre-push`, `use_stdin: true`, sin `|| true`.
  - Mantener `push-to-develop-discipline` con `|| true` para develop; pero añadir override: si el destino es `main` o `release/*`, ejecutar el gate bloqueante.
  - Documentación inline en lefthook.yml reflejando la política "advisory en develop, estricto en release/main".
- review-state: done
- review-implementer: copilot-orchestrator-f00395-s3-verify
- review-reviewer: delivery-verifier-f00395-s3-verify
- review-log: approved by delivery-verifier-f00395-s3-verify — Verified independently: S3 implementation present in HEAD. Lefthook wires release-pr-gate as blocking pre-push hook (lefthook.yml:173).
### S4 — CI workflow `release-pr-gate.yml`
- **Status**: done
- **Files**:
  - `.github/workflows/release-pr-gate.yml`
  - `.github/branch-protection.ts`
  - `.github/branch-protection.yml`
  - `tools/scripts/ci/verify-branch-protection.script.ts`
  - `tools/scripts/ci/verify-branch-protection.spec.ts`
- **Gate**: type, policy
- **Owner**: implementation-runner
- acceptance:
  - Workflow corre en `pull_request` con `branches: [main]`, `types: [opened, synchronize, reopened, ready_for_review]`.
  - Job único `release-pr-gate` ejecuta `bun run typecheck` y `bun run lint`. Timeout 15 min.
  - El check aparece como `release-pr-gate` en PR (nombre estable).
  - `branch-protection.ts` lista `release-pr-gate` y `ci-complete` para `main`.
  - `branch-protection.yml` lista ambos checks en `main`.
  - Spec del verificador actualizado: `makeLive` con `['ci-complete', 'release-pr-gate']`, fixture YAML igual, parser tolera ambos.
  - `bun tools/scripts/ci/verify-branch-protection.script.ts --dry-run` imprime los dos checks para `main`.
- review-state: done
- review-implementer: copilot-orchestrator-f00395-s4-verify
- review-reviewer: delivery-verifier-f00395-s4-verify
- review-log: approved by delivery-verifier-f00395-s4-verify — Verified independently: S4 implementation present in HEAD. CI workflow .github/workflows/release-pr-gate.yml present with PR trigger + workflow_dispatch.
### S5 — Docs y spec helpers
- **Status**: done
- **Files**:
  - `.github/CONTRIBUTING.md`
  - `docs/mcp-vertex/GOVERNANCE-BRANCH-PROTECTION.md`
  - `docs/mcp-vertex/AGENT-BOOTSTRAP.md` (sólo si el bootstrap referencia branch discipline)
- **Gate**: type
- **Owner**: implementation-runner
- acceptance:
  - CONTRIBUTING describe el flujo: cortar `release/<propuesta>`, trabajar, gate pre-push local bloqueante, PR a main, merge, sync main → develop.
  - GOVERNANCE explica la asimetría develop flexible / release strict / main protected, y nombra `release-pr-gate` como check visible.
  - Nota de `LEFTHOOK_BYPASS=1` documentada como vía de emergencia para push a `main` o `release/*`.
- review-state: done
- review-implementer: copilot-orchestrator-f00395-s5-verify
- review-reviewer: delivery-verifier-f00395-s5-verify
- review-log: approved by delivery-verifier-f00395-s5-verify — Verified independently: S5 docs implementation in commit 35e229f6. CONTRIBUTING.md + GOVERNANCE-BRANCH-PROTECTION.md updated with release flow + LEFTHOOK_BYPASS=1 note.
## dependency graph

- S1 y S2 son file-disjoint y pueden ir en commits separados, pero ambos modifican constantes/lints y comparten convención → mismo agente, commits secuenciales para mantener trazabilidad.
- S3 depende de S2.
- S4 depende parcialmente de S2 (mismo nombre `release-pr-gate`).
- S5 depende de S3/S4 (documenta el estado final).
- Plan de ejecución: S1 → S2 → S3 → S4 → S5; todos verificados con `bun run typecheck` + suites focalizadas.

## acceptance

- `bun run typecheck` verde (incluyendo los nuevos scripts).
- `bunx vitest run tools/scripts/lint plugins/commit-policy/tests tools/scripts/ci/verify-branch-protection.spec.ts` verde.
- `bun tools/scripts/ci/verify-branch-protection.script.ts --dry-run` imprime `main — checks=ci-complete, release-pr-gate` y `develop — checks=(none)`.
- Smoke empírico: ejecutar `git push` simulado contra `release/v1.0.0/initial` con un commit que rompe typecheck → exit 1 con blocker claro.
- Smoke empírico: ejecutar contra `develop` con typecheck bueno → exit 0 sin bloqueos.
- Smoke empírico: ejecutar `bun tools/scripts/release/release-plan.ts` y verificar que el flujo R1–R4 sigue pasando (no regresión).

## notes

- S1: revertir `protected-branches.ts` y `push-to-develop-discipline.script.ts`. S2–S4 son aditivos: remover los archivos y revertir lefthook.yml.
- S4: quitar el check `release-pr-gate` de `branch-protection.ts/yml`. El `ci-complete` sigue protegiendo main.
- S5: git revert del commit de docs.
