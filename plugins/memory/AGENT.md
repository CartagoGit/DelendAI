# AGENT.md — plugin `plugins/memory`

> Below the `<!-- mcp-vertex:begin agent-md -->
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
- @mcp-vertex/core

## Writes

- <host workspace>/.mcp-vertex/cache/memory/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/memory/tests/src/lib/checkpoint-packet.spec.ts
- plugins/memory/tests/src/lib/checkpoint-advisory.spec.ts
- plugins/memory/tests/src/lib/session-digest-recall.spec.ts
- plugins/memory/tests/src/lib/compaction.spec.ts

## Do not

- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

