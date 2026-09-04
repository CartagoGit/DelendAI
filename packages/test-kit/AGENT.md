# AGENT.md — package `packages/test-kit`

> Below the `<!-- delendai:begin agent-md -->
## Purpose

- Internal, test-only helpers shared across @delendai workspaces (never published). Home of the typed partial-fake helper that replaces `as unknown as T` casts in test files.

## Public API

- fakePartial
- createFakeToolServer
- asArray

## Depends on

_(none)_

## Writes

_(none)_

## Entry points

_(none)_

## Tests

- packages/test-kit/tests/src/lib/as-array.spec.ts
- packages/test-kit/tests/src/lib/fake-partial.spec.ts
- packages/test-kit/tests/src/lib/fake-tool-server.spec.ts

## Do not

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

