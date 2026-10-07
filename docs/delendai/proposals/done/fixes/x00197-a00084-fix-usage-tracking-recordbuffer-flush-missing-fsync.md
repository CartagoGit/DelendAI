---
id: x00197
title: "a00084 fix — usage-tracking RecordBuffer flush missing fsync"
kind: fix
status: done
type: proposal
track: a00084-audit-followup
date: 2026-07-30
shipped-in:
    - 32f5e80b # fix(x00197): a00084 #18 — RecordBuffer flush missing fsync
---

# x00197 — a00084 fix — usage-tracking RecordBuffer flush missing fsync

## Goal

Fix a00084 finding #18: `RecordBuffer.drain()` appended each flushed batch via plain `fs/promises.appendFile`, with no fsync — the batch could sit in the OS page cache with no durability guarantee, so a crash or SIGKILL shortly after a "successful" flush could silently lose it. The header comment already documented "one fsync per 250ms window or 64 entries", but the implementation never actually called fsync. Now `drain()` opens the file, writes the batch, calls `handle.sync()`, then closes — matching the already-documented contract and the durable-write posture (mutex + atomic + redact) used by every other write in this plugin.

## why

Durability gap (AGENTS.md rule 4: atomic + mutex) on the usage/cost tracking log — a plugin explicitly declared as accruing real cost/history data (`cacheNamespace: 'results'`, not derivable cache). The existing tolerant reader (skips a malformed trailing line) bounds the blast radius but does not eliminate it: without fsync, an OOM-kill or crash can lose a fully "flushed" batch that never made it past the page cache.

## non-goals

- Migrating the single invocations.jsonl file to per-batch segment files (a heavier redesign the audit also floated) — the append-only single-file format plus the existing tolerant-reader skip-malformed-tail-line behavior is kept; only the missing fsync is fixed, which addresses the actual durability gap (crash/kill losing an already-flushed batch) at a much smaller blast radius than a file-format migration touching every reader/writer/clear-tool in the plugin.

## Slices

- global_gate: type

### S1 — RecordBuffer.drain(): fsync each flushed batch
- **Status**: done
- **Files**: `plugins/usage-tracking/src/lib/record-buffer.ts`
- **Gate**: type
- acceptance:
  - "drain() opens the file, writes the batch, calls handle.sync(), then closes — no more plain appendFile"
  - "bun test plugins/usage-tracking passes (100/100, no regressions)"
  - "bun run typecheck passes"

## acceptance

- drain() opens the file, writes the batch, calls handle.sync(), then closes — no more plain appendFile
- bun test plugins/usage-tracking passes (100/100, no regressions)
- bun run typecheck passes
