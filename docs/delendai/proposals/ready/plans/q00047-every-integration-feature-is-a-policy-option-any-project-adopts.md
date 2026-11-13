---
id: q00047
title: "Every integration feature is a policy option any project adopts"
kind: plan
status: ready
type: proposal
track: general
date: 2026-11-09
---

# q00047 — Every integration feature is a policy option any project adopts

## goal

Everything built in delendai's own development (dogfooding) is adoptable by ANY project that runs delendai as its MCP server, optionally and configurably, with that project's own validations. Nothing delendai-specific is required or leaks. Example project: api-source-tanit, which already runs delendai with --branch=main. Features covered: land, the single integrator with overlap batches (q00046); sectioned checks per PR with the full suite at promotion (q00045, v00155); the [<Nms] test time budgets (c00537 S7); deterministic-spec lints (c00537); the integration rehearsal (i00005); one branch per unit with draft PRs (q00046 S5); the proposal-issue mirror (the proposal file is the source, the forge issue a generated projection with labels, PRs carry Refs/Closes, a human issue can be adopted); the PR and issue text format (f00809). Pinned releases (f00810) drive upgrades. Ordered after q00046 S4: start S1 only once the q00046 cutover to land has landed, because the options describe that engine.

## why

Today these features are wired to this repository: its workflows, its scripts, its test layout. A project that adopts delendai gets the policy and the tools but must rebuild the CI, integration and promotion machinery by hand, or goes without. Principles: agnostic (a fix reaches every consuming project), easy to use (the default works with no configuration), bounded (an option off is fully absent, never half on).

## non-goals

- No change to delendai's own policy defaults for this repository: its profile keeps every feature on.
- No delendai-specific validation, script or path is emitted into a foreign project; validations come from that project's own commands.
- No forge feature beyond the four adapter calls of q00046 (check status, merge pinned to a SHA, update-branch, label), plus issue create/update/label for S5.
- No code is written by this planning proposal; each slice is its own change.

## slices

- global_gate: none

### S1 — Feature switches in the policy
- **Status**: pending
- **Files**: `packages/core/src/lib/development-policy/integration-features.ts`
- **Gate**: none
- acceptance:
  - "The policy has a development.integration block with engine (land|queue|none), batching, issueMirror, sectionedChecks, testBudgets, rehearsal and draftPrs, validated by a schema, with per-profile defaults and a documented table"
  - "A feature set to off is fully absent: no workflow, hook, label, tool refusal or status line mentions it; a spec asserts each off switch against a project with the block all off"
  - "The default for a project with no block is the lightest profile and works with no configuration"
  - "A doctor check reports a contradictory block (for example batching on with engine none, or issueMirror on with no forge adapter) and names the fix"
  - "Ordered after q00046 S4: depends on the land engine that cutover delivers"

### S2 — Generated workflows from templates
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `packages/core/src/lib/init/integration-workflow-templates.service.ts`
- **Gate**: none
- acceptance:
  - "delendai init and adopt emit the CI, land and promotion workflows for the project's forge from templates, reading the enabled features from the policy"
  - "Only enabled features are emitted; a spec proves a project with everything off gets no integration workflow"
  - "Validation steps are the project's own commands, taken from the quality and presets plugins and from its package scripts, never delendai's own scripts or paths"
  - "The generated files carry a header with the delendai version and a content hash, and re-running init is idempotent and never overwrites an edited file without saying so"

### S3 — Upgrade and drift
- **Status**: pending
- **DependsOn**: [S2]
- **Files**: `packages/core/src/lib/workflows/workflows-sync.service.ts`
- **Gate**: none
- acceptance:
  - "delendai workflows sync regenerates the workflows when the pinned delendai version (--version, f00810) or the policy block changes, and shows a diff before writing"
  - "The drift check flags a workflow that is stale against the pinned version or the policy, and one hand-edited, with the command that fixes it"
  - "A project-edited region is preserved or reported, never silently lost"

### S4 — The section function is pluggable per project
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `packages/core/src/lib/sections/project-section-function.service.ts`
- **Gate**: none
- acceptance:
  - "By default the section function (v00155, q00045) uses the project's own test runner and import graph; no delendai test layout is assumed"
  - "A project can declare zones in its configuration and they replace the default; the same function feeds the per-PR checks and land's overlap grouping, never a second copy"
  - "With sectionedChecks off, every PR runs the project's full suite and land treats every pair of PRs as overlapping"
  - "The [<Nms] test time budgets (c00537 S7) and the deterministic-spec lints apply only to the project's declared test globs and only when testBudgets is on"

### S5 — The issue mirror as an option
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `packages/core/src/lib/forge/issue-mirror.service.ts`
- **Gate**: none
- acceptance:
  - "With issueMirror on, the proposal file stays the source and the forge issue is a generated projection with labels, through the forge adapter only, in the f00809 text format"
  - "Pull requests carry Refs or Closes to the mirrored issue, and a human-opened issue can be adopted into a proposal without losing its text"
  - "land (q00046) is the sync step: the projection is updated after a merge, not by a second cron or actor"
  - "With issueMirror off, no issue is created, read or labelled and no reference is written into PR text"
  - "Depends on q00046 S4 (land) being on the integration branch"

### S6 — Proof in a foreign project
- **Status**: pending
- **DependsOn**: [S2, S3, S4, S5]
- **Files**: `docs/delendai/foreign-project-integration-proof.md`
- **Gate**: none
- acceptance:
  - "The methodology is adopted in api-source-tanit (or a throwaway copy of it) with its own validations, respecting that project's existing delendai configuration (it already runs with --branch=main)"
  - "PR time and human merges are measured there before and after, with the same method as q00046's weekly KPIs, and recorded"
  - "A grep of the generated files in that project finds nothing delendai-specific (no delendai script, path or proposal id) other than the version pin and the documented header"
  - "The proof states which options were on, which were off, and what each cost or saved"

## acceptance

- The policy has a development.integration block with engine (land|queue|none), batching, issueMirror, sectionedChecks, testBudgets, rehearsal and draftPrs, validated by a schema, with per-profile defaults and a documented table
- A feature set to off is fully absent: no workflow, hook, label, tool refusal or status line mentions it; a spec asserts each off switch against a project with the block all off
- The default for a project with no block is the lightest profile and works with no configuration
- A doctor check reports a contradictory block (for example batching on with engine none, or issueMirror on with no forge adapter) and names the fix
- Ordered after q00046 S4: depends on the land engine that cutover delivers
- delendai init and adopt emit the CI, land and promotion workflows for the project's forge from templates, reading the enabled features from the policy
- Only enabled features are emitted; a spec proves a project with everything off gets no integration workflow
- Validation steps are the project's own commands, taken from the quality and presets plugins and from its package scripts, never delendai's own scripts or paths
- The generated files carry a header with the delendai version and a content hash, and re-running init is idempotent and never overwrites an edited file without saying so
- delendai workflows sync regenerates the workflows when the pinned delendai version (--version, f00810) or the policy block changes, and shows a diff before writing
- The drift check flags a workflow that is stale against the pinned version or the policy, and one hand-edited, with the command that fixes it
- A project-edited region is preserved or reported, never silently lost
- By default the section function (v00155, q00045) uses the project's own test runner and import graph; no delendai test layout is assumed
- A project can declare zones in its configuration and they replace the default; the same function feeds the per-PR checks and land's overlap grouping, never a second copy
- With sectionedChecks off, every PR runs the project's full suite and land treats every pair of PRs as overlapping
- The [<Nms] test time budgets (c00537 S7) and the deterministic-spec lints apply only to the project's declared test globs and only when testBudgets is on
- With issueMirror on, the proposal file stays the source and the forge issue is a generated projection with labels, through the forge adapter only, in the f00809 text format
- Pull requests carry Refs or Closes to the mirrored issue, and a human-opened issue can be adopted into a proposal without losing its text
- land (q00046) is the sync step: the projection is updated after a merge, not by a second cron or actor
- With issueMirror off, no issue is created, read or labelled and no reference is written into PR text
- Depends on q00046 S4 (land) being on the integration branch
- The methodology is adopted in api-source-tanit (or a throwaway copy of it) with its own validations, respecting that project's existing delendai configuration (it already runs with --branch=main)
- PR time and human merges are measured there before and after, with the same method as q00046's weekly KPIs, and recorded
- A grep of the generated files in that project finds nothing delendai-specific (no delendai script, path or proposal id) other than the version pin and the documented header
- The proof states which options were on, which were off, and what each cost or saved
