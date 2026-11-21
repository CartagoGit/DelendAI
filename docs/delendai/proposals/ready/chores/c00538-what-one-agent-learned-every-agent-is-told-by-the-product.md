---
id: c00538
title: "What one agent learned, every agent is told by the product"
kind: chore
status: ready
type: proposal
track: general
date: 2026-11-08
---

# c00538 — What one agent learned, every agent is told by the product

## goal

A rule one agent learns the hard way is refused by a check or told at the moment it matters, so no other agent relearns it.

## why

Pitfalls found in one agent's private notes were each either already enforced, or caught only in CI, or knowledge an agent meets only after a red PR. The knowledge now lives in the skills agents read; these slices add the checks still missing so a change is refused where it is written.

## non-goals

- Do not edit AGENT-BOOTSTRAP.md: its size budget is fixed.
- Do not wire into the proof plan script until the open PRs that change it have merged.

## slices

- global_gate: none

### S1 — A lint refuses a CI job that needs scoped jobs but has no status function in its if
- **Status**: pending
- **Files**: `tools/scripts/lint/workflow-needs-status-function.script.ts`, `tools/scripts/lint/workflow-needs-status-function.script.spec.ts`
- **Gate**: none
- acceptance:
  - "A job whose needs include a job skipped by plan-scope and whose if lacks cancelled() or always() is refused with the job name and the fix"
  - "The lint runs in the CI lint job"

### S2 — A lint refuses a runtime import of a workspace package that the test resolver does not alias to source
- **Status**: pending
- **Files**: `tools/scripts/lint/test-alias-covers-runtime-imports.script.ts`, `tools/scripts/lint/test-alias-covers-runtime-imports.script.spec.ts`
- **Gate**: none
- acceptance:
  - "A package importing a runtime value from another workspace package without an alias in both vitest configs is refused naming both files"
  - "The check does not depend on any package having been built"

### S3 — The local proof runs the checks that otherwise only fail in CI, chosen by what the change touches
- **Status**: pending
- **Files**: `tools/scripts/ci/ci-only-checks.constant.ts`, `tools/scripts/ci/ci-only-checks.helper.ts`, `tools/scripts/ci/ci-only-checks.helper.spec.ts`
- **Gate**: none
- acceptance:
  - "A table maps a touched file kind to its check: new CLI command to the help-summary lint, non-English text in a spec to the English-prose lint, a legacy product name to the rebrand check, an outputSchema to types:generate, a new package manifest to the brand-logo and publish-order specs"
  - "A change touching none of them adds no check"
  - "Wiring into the proof plan lands once the open PRs that change it have merged"

### S4 — A check refuses a tool that registers only when the workspace has some file
- **Status**: pending
- **Files**: `tools/scripts/lint/register-is-unconditional.script.ts`, `tools/scripts/lint/register-is-unconditional.script.spec.ts`
- **Gate**: none
- acceptance:
  - "Registering every plugin in an empty workspace and in this repository yields the same tool names, else the plugin and the tool are named"
  - "The refusal says to decide passive per call, not at registration"

## acceptance

- A job whose needs include a job skipped by plan-scope and whose if lacks cancelled() or always() is refused with the job name and the fix
- The lint runs in the CI lint job
- A package importing a runtime value from another workspace package without an alias in both vitest configs is refused naming both files
- The check does not depend on any package having been built
- A table maps a touched file kind to its check: new CLI command to the help-summary lint, non-English text in a spec to the English-prose lint, a legacy product name to the rebrand check, an outputSchema to types:generate, a new package manifest to the brand-logo and publish-order specs
- A change touching none of them adds no check
- Wiring into the proof plan lands once the open PRs that change it have merged
- Registering every plugin in an empty workspace and in this repository yields the same tool names, else the plugin and the tool are named
- The refusal says to decide passive per call, not at registration
