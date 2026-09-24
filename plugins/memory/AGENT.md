# AGENT.md — plugin `plugins/memory`

> Below the `<!-- delendai:begin agent-md -->
## Purpose

- Persistent memory store (BM25 + recall, save, search).

## Public API

- default
- readStore
- writeStore
- saveNote
- recall
- removeNote
- exportNotes
- importNotes
- redactSecrets
- rankNotes
- tokenize
- buildMemoryToolRegistrations
- buildCheckpointPacket
- DEFAULT_CHECKPOINT_PACKET_MAX_DIGEST_CHARS

## Depends on

- @modelcontextprotocol/sdk
- zod
- @delendai/core

## Writes

- <host workspace>/.delendai/cache/memory/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/memory/tests/src/lib/checkpoint-advisory.spec.ts
- plugins/memory/tests/src/lib/checkpoint-freshness.spec.ts
- plugins/memory/tests/src/lib/checkpoint-packet.spec.ts
- plugins/memory/tests/src/lib/compact-tool.spec.ts

## Do not

- An agent does not run `git stash`: git refuses it for agents (`delendai guard`, reference-transaction), because every worktree shares one stash and stashed work is invisible to the work model. Commit, or checkpoint to your work ref, instead.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

