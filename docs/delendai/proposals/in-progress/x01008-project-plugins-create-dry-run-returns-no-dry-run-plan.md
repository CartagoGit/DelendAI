---
id: x01008
title: "project_plugins_create dry run returns no dry-run plan"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-11-03
last-transition-id: e3f70734-9447-4670-a9e0-51a7ff8e6b05
last-correlation-id: e3f70734-9447-4670-a9e0-51a7ff8e6b05
last-transition-from: in-progress
last-transition-at: 2026-11-03T09:58:00.842Z
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
- **Status**: review
- **Files**: `packages/core/src/lib/scaffold/project-plugins.ts`, `packages/core/tests/src/lib/scaffold/project-plugins-behaviour.spec.ts`, `packages/core/src/generated/tool-outputs.ts`
- **Gate**: none
- shipped-in: `6747b9bb94c5`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

## acceptance

- `project-plugin create <name> --dry-run` writes nothing and answers with `dryRun: true`, `wouldChange` and `risk`.
- The behaviour spec asserts the plan and that no config or plugin file exists afterwards.
