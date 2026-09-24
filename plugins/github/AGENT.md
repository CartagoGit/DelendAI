# AGENT.md — plugin `plugins/github`

> Below the `<!-- delendai:begin agent-md -->
## Purpose

- GitHub read-only provider context, HTTP client and remote resource tools.

## Public API

_(none)_

## Depends on

- @delendai/contracts
- @delendai/remote-provider-core
- zod
- @delendai/core

## Writes

- <host workspace>/.delendai/cache/github/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/github/tests/diagnose-github-workflow.spec.ts
- plugins/github/tests/diagnostics.spec.ts
- plugins/github/tests/src/lib/client.spec.ts
- plugins/github/tests/src/lib/plugin-options.spec.ts

## Do not

- An agent does not run `git stash`: git refuses it for agents (`delendai guard`, reference-transaction), because every worktree shares one stash and stashed work is invisible to the work model. Commit, or checkpoint to your work ref, instead.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

