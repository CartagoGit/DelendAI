# AGENT.md — plugin `plugins/framework-knowledge`

> Below the `<!-- delendai:begin agent-md -->
## Purpose

- Resolves what the project’s installed framework version allows, recommends and forbids, before an agent writes code.

## Public API

- default
- createKnowledgeRecord
- FORCE_VALUES
- forceRank
- isKnowledgeForce

## Depends on

- @modelcontextprotocol/sdk
- zod
- @delendai/core

## Writes

- <host workspace>/.delendai/cache/framework-knowledge/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/framework-knowledge/tests/src/lib/cache/knowledge-cache.spec.ts
- plugins/framework-knowledge/tests/src/lib/detect/detect-convention.spec.ts
- plugins/framework-knowledge/tests/src/lib/knowledge/knowledge-record.spec.ts
- plugins/framework-knowledge/tests/src/lib/policy/resolve-policy.spec.ts

## Do not

- An agent does not run `git stash`: git refuses it for agents (`delendai guard`, reference-transaction), because every worktree shares one stash and stashed work is invisible to the work model. Commit, or checkpoint to your work ref, instead.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

