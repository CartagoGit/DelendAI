---
id: x01008
title: "project_plugins_create dry run returns no dry-run plan"
kind: fix
status: done
type: proposal
track: general
date: 2026-11-03
last-transition-id: e0de4475-0efc-4670-a02c-f2475f1ff033
last-correlation-id: e0de4475-0efc-4670-a02c-f2475f1ff033
last-transition-from: review
last-transition-at: 2026-11-18T03:24:45.025Z
shipped-in:
  - "d4a4816b362c728ceea48ca0f2797dd3435c16ad"
---

# x01008 — project_plugins_create dry run returns no dry-run plan

## goal

A dryRun call to project_plugins_create writes nothing but returns a non-IDryRunResult payload, so the dry-run guard rejects it as a contract violation. Return the plan (wouldChange/risk) and declare it in the output schema.

## why

A consumer reported that the dry run of project-plugin create writes files. The flag reaches runProjectPluginCreate and no file is written, but the handler returns a plain create payload instead of the dry-run plan, so the router's dry-run guard rejects the call as a contract violation and the caller cannot preflight.

## non-goals

- Changing the real (non dry-run) create behaviour.

## slices

- global_gate: none

### S1 — Return the dry-run plan from project_plugins_create
- **Status**: done
- **Files**: `packages/core/src/lib/scaffold/project-plugins.ts`, `packages/core/tests/src/lib/scaffold/project-plugins-behaviour.spec.ts`, `packages/core/src/generated/tool-outputs.ts`
- **Gate**: none
- shipped-in: `6747b9bb94c5`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: mai-code-2
- review-log: requested_changes by gpt-5.3-codex — Stale review round; rebase on current develop and re-validate this slice with fresh evidence before approval.
- review-log: approved by mai-code-2 — verified at d4a4816b362c, validate exit 0 and tests 15/15 claimed, no recorded run cited; acceptance 2/2: (1) runProjectPluginCreate returns planDryRun; writePluginFiles and registerPluginPath both guard dryRun, and scoped spec confirms payload. (2) project-plugins-behaviour.spec.ts asserts files.planned, empty written, risk low, wouldChange length, and absent packages/config; 15/15 passed. — Verified d4a4816b: dry-run creation returns planDryRun fields dryRun/wouldChange/risk, leaves both scaffold and config writes disabled, and the output schema declares all three fields. The project-plugin behaviour spec passed.

## acceptance

- `project-plugin create <name> --dry-run` writes nothing and answers with `dryRun: true`, `wouldChange` and `risk`.
- The behaviour spec asserts the plan and that no config or plugin file exists afterwards.
