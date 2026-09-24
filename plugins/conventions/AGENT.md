# AGENT.md — plugin `plugins/conventions`

> Below the `<!-- delendai:begin agent-md -->
## Purpose

- Repo file-convention enforcement (interface, constant, service, tool …).

## Public API

- classifyPath
- TYPESCRIPT_RULES
- type IRoleRule
- type Role
- scanConventions
- type IConventionsScanResult
- type IDirEntry
- type IDirReader

## Depends on

- @modelcontextprotocol/sdk
- zod
- @delendai/core

## Writes

- <host workspace>/.delendai/cache/conventions/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/conventions/tests/src/lib/layers/layer-graph.spec.ts
- plugins/conventions/tests/src/lib/plugin.spec.ts
- plugins/conventions/tests/src/lib/profiles/language-profiles.spec.ts
- plugins/conventions/tests/src/lib/profiles/profile-registry.spec.ts

## Do not

- An agent does not run `git stash`: git refuses it for agents (`delendai guard`, reference-transaction), because every worktree shares one stash and stashed work is invisible to the work model. Commit, or checkpoint to your work ref, instead.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

