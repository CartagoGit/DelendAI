# AGENT.md — plugin `plugins/integration`

> Below the `<!-- delendai:begin agent-md -->
## Purpose

- The pull request flow proven on real GitHub: a rehearsal of every case and production failure, with a report of what the forge did.

## Public API

- createGithubRehearsalForge
- createRehearsalSetup
- landIntegratorWorkflow
- rehearsalPolicy
- renderRehearsalWorkflow
- rehearse
- selectScenarios
- buildReport
- renderReportTable
- REHEARSAL_CATALOGUE
- diagnoseIdentity
- renderAppManifest
- renderDoctorTable
- judgePrCiWall

## Depends on

- zod
- @delendai/core

## Writes

- <host workspace>/.delendai/cache/integration/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/integration/tests/src/lib/services/integration-doctor.service.spec.ts
- plugins/integration/tests/src/lib/services/rehearsal-cleanup.service.spec.ts
- plugins/integration/tests/src/lib/services/rehearsal-expectation.service.spec.ts
- plugins/integration/tests/src/lib/services/rehearsal-github-forge.service.spec.ts

## Do not

- An agent does not run `git stash`: git refuses it for agents (`delendai guard`, reference-transaction), because every worktree shares one stash and stashed work is invisible to the work model. Commit, or checkpoint to your work ref, instead.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

