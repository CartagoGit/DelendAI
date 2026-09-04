# AGENT.md — plugin `plugins/commit-policy`

> Below the `<!-- delendai:begin agent-md -->
## Purpose

- Commit-authority plugin: configurable identity, cadence and audit-trail policy wrapping the git plugin primitives. Off by default — opt in via plugins.commit-policy.options.

## Public API

- default
- CommitPolicyOptionsSchema
- buildReleaseBranch
- isReleaseBranch
- resolveAuthor
- commitWithGuard
- runCommitDriver
- runPushDriver
- appendAuditTrailer
- localizedString
- SUPPORTED_LOCALES
- createSliceListener
- readCurrentSliceSnapshot
- createThresholdTracker

## Depends on

- @modelcontextprotocol/sdk
- zod
- @delendai/core

## Writes

- <host workspace>/.delendai/cache/commit-policy/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/commit-policy/src/lib/branch-policy/index.spec.ts
- plugins/commit-policy/src/lib/engine.spec.ts
- plugins/commit-policy/src/lib/release-finalize/index.spec.ts
- plugins/commit-policy/tests/integration/cross-agent-real.spec.ts

## Do not

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

- `delendai_commit-policy_commit_policy_storms` — 2,467 B total, 2,011 B of it `outputSchema` (measured, see docs/delendai/TOKEN-BUDGETS.md)

<!-- delendai:end agent-md -->

