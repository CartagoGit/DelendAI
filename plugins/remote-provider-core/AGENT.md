# AGENT.md — plugin `plugins/remote-provider-core`

> Below the `<!-- delendai:begin agent-md -->
## Purpose

- Shared remote-provider foundation: validated config, injectable HTTP, normalized errors.

## Public API

_(none)_

## Depends on

- @delendai/contracts
- zod
- @delendai/core

## Writes

- <host workspace>/.delendai/cache/remote-provider-core/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/remote-provider-core/tests/diagnostics-e2e.spec.ts
- plugins/remote-provider-core/tests/diagnostics.spec.ts
- plugins/remote-provider-core/tests/http-client.spec.ts
- plugins/remote-provider-core/tests/mutations.spec.ts

## Do not

- An agent does not run `git stash`: git refuses it for agents (`delendai guard`, reference-transaction), because every worktree shares one stash and stashed work is invisible to the work model. Commit, or checkpoint to your work ref, instead.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

