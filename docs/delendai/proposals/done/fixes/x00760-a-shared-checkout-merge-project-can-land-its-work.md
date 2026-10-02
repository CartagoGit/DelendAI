---
id: x00760
title: "A shared-checkout-merge project can land its work"
kind: fix
status: done
type: proposal
track: hosts
date: 2026-09-29
last-transition-id: cccf3885-6906-46bf-9273-af7f7689f423
last-correlation-id: cccf3885-6906-46bf-9273-af7f7689f423
last-transition-from: review
shipped-in:
  - "a4a0a88878531a50285fc40e238eb1c755660ba0"
---

# x00760 — A shared-checkout-merge project can land its work

## Goal

Under a profile whose integration strategy is `merge`, a shipped command (CLI and the `work` tool) lands a published unit on the integration branch through `runLocalMergeCycle`, after the local validation gate certifies it against the current integration head.

## why

The served work model (x00759) tells an agent on `shared-checkout-merge` to finish with `delendai work publish` and that delendai's integration engine merges it after the local gate. Nothing shipped calls the engine: `runLocalMergeCycle` and `createIntegrationEngine` have no caller outside their specs, and `work publish` under this profile pushes a publication ref and stops. The declared route is not runnable, so work on such a project stalls on its publication ref, or an agent improvises a hand-made merge.

## non-goals

- Changing how pull-request profiles land work.

## Slices

- global_gate: type

### S1 — The unit lands by local merge after its certification
- **Status**: done
- **Files**: `packages/core/src/lib/work-units/work-unit-publish.service.ts`, `packages/core/src/lib/work-units/work-unit-land.service.ts`, `packages/core/src/lib/work-units/local-certification.service.ts`, `packages/core/src/lib/work-units/validation-gate-steps.service.ts`, `packages/core/src/lib/work-units/work-publish.service.ts`, `packages/core/src/lib/contracts/interfaces/local-certification.interface.ts`, `packages/core/src/lib/contracts/interfaces/work-publish.interface.ts`, `packages/core/src/lib/integration-engine/local-merge-cycle.ts`, `packages/core/src/lib/integration-engine/local-merge-cycle.interface.ts`, `packages/core/src/lib/integration-engine/local-merge-gate.ts`, `packages/core/src/lib/development-policy/declare-workflow.ts`, `packages/core/src/lib/tools/work-unit.tool.ts`, `packages/core/src/cli.ts`, `packages/cli/src/lib/validate-run.service.ts`, `packages/cli/src/contracts/interfaces/validate-run.interface.ts`, `packages/core/tests/src/lib/work-units/work-unit-land.service.spec.ts`, `packages/core/tests/src/lib/work-units/local-certification.service.spec.ts`, `packages/core/tests/src/lib/integration-engine/local-merge-cycle.spec.ts`, `packages/core/tests/src/lib/development-policy/declare-workflow.spec.ts`
- **Gate**: type
- acceptance:
  - "Under `integration.strategy: merge`, publishing a unit runs the project's validation gate against the current integration head and merges the work ref with `runLocalMergeCycle`, never in the shared checkout."
  - "A red certification, a stale head and a conflict each end in a refusal that names the next step; nothing lands uncertified."
  - "Under a pull-request profile nothing changes."
- shipped-in: `de71f8444623`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — x00760 S1 - a shared-checkout-merge project can land its work. Real feat commit is a4a0a88878531a50285fc40e238eb1c755660ba0 (the merge d5da051b7 brought it into develop; shipped-in de71f8444 is the smaller follow-up). Adds packages/core/src/lib/work-units/{work-unit-publish.service.ts,work-unit-land.service.ts,local-certification.service.ts,validation-gate-steps.service.ts,work-publish.service.ts} + integration-engine/{local-merge-cycle.ts,local-merge-gate.ts} + declare-workflow.ts + work-unit.tool.ts + cli.ts. The CLI re-export de71f8444623 keeps validate-run.service.ts in its documented location. gate: type. Repo typecheck has 4 pre-existing module-not-found errors (better-sqlite3, @anthropic-ai/tokenizer); NONE in x00760-touched files. focused gate: vitest run packages/core/tests/src/lib/work-units/work-unit-land.service.spec.ts + local-certification.service.spec.ts + integration-engine/local-merge-cycle.spec.ts + development-policy/declare-workflow.spec.ts => 4 files / 53 tests passed, exit 0. Acceptance: 'lands on main after the gate when the release branch is omitted' + 'lands on main after the gate when integration and release are both main' + 'lands on main after the gate when the project declares no policy at all' + 'still refuses a failing gate on main and keeps the work' are explicit.

## acceptance

- Under `integration.strategy: merge`, publishing a unit runs the project's validation gate against the current integration head and merges the work ref with `runLocalMergeCycle`, never in the shared checkout.
- A red certification, a stale head and a conflict each end in a refusal that names the next step; nothing lands uncertified.
- Under a pull-request profile nothing changes.

## notes

- `work publish` under `integration.strategy: merge` calls `landWorkUnit`: it holds the work ref, runs `runLocalMergeCycle` with a `certify` hook, and ends the work ref with the same `endWorkRef` a publication uses (kept while the proposal is still in progress, as before).
- `runLocalMergeCycle` certifies inside its critical section: after reading the head it answers a stale base (`staleBase`) and a conflict before any gate runs, builds the merge commit in a throwaway index, and passes that commit to `certify`; the pushed commit is the certified one.
- The gate is the one the integration head declares (`validationMatrix.scopes`, else a `validate` script), read from that commit with `git show`, so a unit cannot land by weakening the gate it carries. It runs in a detached worktree under the git directory, output captured; no gate declared, a candidate that cannot be put on disk, or a failed step all land nothing.
- `delendai validate` and the certification share one declaration reader (`validationGateSteps`).
- The served instructions name the command (`delendai work publish --proposal=<id> --slice=<slice> --agent=<you>`), who certifies, and when the work ref ends, per strategy.
- Known limit: the certification worktree is a fresh checkout; a gate that needs installed dependencies must install them itself (e.g. declare the install as the first matrix step).
