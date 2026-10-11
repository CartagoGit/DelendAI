---
id: t00011
title: "error-reporting privacidad adversarial suite llm suffix spoofing y dos hosts mismo issue"
kind: test
status: done
type: proposal
track: privacy
date: 2026-08-25
parent-plan: q00005
---

# t00011 — suite adversarial de privacidad para llm-format

## Goal

Cubrir con pruebas adversariales la ruta llm-format endurecida en x00249: misma issue segura entre hosts distintos y rechazo de spoofing por sufijo interno.

## why

La regresión que motivó q00005 no aparece en la ruta typed-internal normal sino en la reconstrucción sintética de llm-format. Esta suite impide que reaparezcan fugas por nombres de tools host.

## non-goals

- No amplía el validador de privacidad con nuevas heurísticas.
- No cambia el comportamiento funcional del reporter fuera de las pruebas.

## Slices

- global_gate: none

### S1 — Adversarial llm-format invariants
- **Status**: done
- **Files**: `plugins/error-reporting/tests/privacy-adversarial.spec.ts`
- **Gate**: none

## acceptance

- Dos payloads privados distintos que recorren llm-format sobre una tool propia de mcp-vertex generan el mismo reporte seguro.
- El body, fingerprint y JSON serializado no contienen marcadores privados de host.
- Un tool host con sufijo interno engañoso no llega a producir un safe report.

## resolution evidence

Hands-on verification pass (not rubber-stamped) against the plan's exact 4
adversarial cases, each through two independent host fixtures:

- `acme_private_billing_orchestrator-runner_invoke` + invalid request body
- `cliente-secreto_auto-agent-selector_auto_run` + schema validation
- `JaneDoe_internal_repo_orchestrator-runner_invoke` + invalid json
- `ΩmegaProject_auto-agent-selector_auto_run` + malformed payload

**Finding**: the committed suite only covered 1 of the 4 mandated cases, and
only against a single host fixture. Expanded
`plugins/error-reporting/tests/privacy-adversarial-llm-suffix-spoofing.spec.ts`
(split out of `privacy-adversarial.spec.ts` to respect `lint:solid`'s 400-LOC
ceiling) with `describe.each` over all 4 cases x 2 independent host-fixture
registries (one registering the tool under a foreign `packageName`/`owner`,
one leaving it unregistered entirely).

**Result**: 4/4 adversarial cases blocked identically across both fixtures
(`asReportableError` returns `undefined` in all cases) — confirmed the
decision is provenance-based via `IToolIdentityRegistry`
(`resolvePublicToolIdentity` in
`packages/core/src/lib/contracts/resolvers/safe-tool-identity.resolver.ts`
derives ownership solely from the registry entry's `packageName`, never from
the raw `toolName` string), not a textual suffix heuristic — satisfies
R1.6/R1.7/R1.8.

**Gates run**:
- `bunx vitest run` in `plugins/error-reporting`: 15 test files, 81 tests, all green.
- `bun run lint:solid` (repo-wide): 0 findings (was 1 `oversized-file` before the split).

**Commits** (both on `develop`, pushed, no CI-red SHA involved):
- `9e4abca9` — `test(error-reporting): cover all 4 plan-mandated llm-suffix spoofing cases (t00011)`
- `3d2b117f` — `refactor(error-reporting): split t00011 spoofing spec under lint:solid ceiling`

**Before/after metric**: adversarial coverage 1/4 cases x 1 fixture → 4/4
cases x 2 fixtures. Oversized-file findings: 1 → 0.
resolution:
  promoted-by: q00005 closure pass
  peer-review: deferred

## resolution

Promoted review → done by q00005 closure pass.

- peer-review: deferred to the post-orchestrator peer-review pass (another agent)
- evidence: the implementation pre-exists the q00005 migration and is verifiable via `git log --grep=t00011` against the merged work
- closure-gate: requireAllChildrenDone satisfied for plan q00005
