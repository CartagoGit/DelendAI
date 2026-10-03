# AGENT.md — plugin `plugins/quality-policy`

> Below the `<!-- delendai:begin agent-md -->
## Purpose

- Unified quality-policy surface: cheap tests, conventions, lint, types and coverage guidance without running heavy quality commands.

## Public API

- default
- buildQualityPolicyToolRegistrations
- QualityPolicyOutputSchema
- runQualityPolicy

## Depends on

- @delendai/conventions
- @delendai/quality
- @delendai/rules
- @delendai/test-convention
- @delendai/test-policy
- @modelcontextprotocol/sdk
- zod
- @delendai/core

## Writes

- <host workspace>/.delendai/cache/quality-policy/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/quality-policy/tests/src/lib/services/quality-policy-format.service.spec.ts
- plugins/quality-policy/tests/src/lib/services/validation-coordinator.service.spec.ts
- plugins/quality-policy/tests/src/lib/services/validation-evidence.service.spec.ts
- plugins/quality-policy/tests/src/lib/services/validation-scope.service.spec.ts

## Do not

- An agent does not run `git stash`: git refuses it for agents (`delendai guard`, reference-transaction), because every worktree shares one stash and stashed work is invisible to the work model. Commit, or checkpoint to your work ref, instead.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

