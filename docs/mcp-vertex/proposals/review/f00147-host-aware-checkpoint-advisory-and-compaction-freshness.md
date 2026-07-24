---
id: f00147
title: "Host-aware checkpoint advisory and compaction freshness"
kind: feat
status: review
type: proposal
track: memory+host-adapters
date: 2026-07-24
---

# f00147 — Host-aware checkpoint advisory and compaction freshness

## Goal

Provide a bounded, one-shot advisory based on explicit host lifecycle evidence and the age of the latest durable checkpoint, without fabricating a semantic checkpoint from private transcripts.

## why

A post-compaction packet can restore a pre-existing digest, but it cannot tell
whether that digest is missing or stale at the moment a host compacted. A
small, explicit advisory gives hosts a truthful checkpoint signal while
preserving the rule that only an agent with semantic work state may write a
summary.

## non-goals

- No automatic summary generated from a transcript, hook payload, or inferred
  work state.
- No use of private host context/quota values.
- No blocking or destructive action at compaction or session end.

## Slices

- global_gate: validate

### S1 — Derive checkpoint freshness from durable memory metadata
- **Status**: done
- **Files**: `plugins/memory/src/lib/services/checkpoint-freshness.ts`, `plugins/memory/src/public/index.ts`, `plugins/memory/tests/src/lib/checkpoint-freshness.spec.ts`
- **Gate**: memory tests + typecheck
- **Acceptance**: a pure helper reports missing/fresh/stale checkpoint state
  from the latest explicit digest timestamp, with a bounded configurable age.

### S2 — Surface a one-shot, host-event-aware advisory
- **Status**: done
- **Files**: `plugins/memory/src/lib/tools/checkpoint-packet.tool.ts`, `plugins/memory/tests/src/lib/checkpoint-packet.spec.ts`, `config/external/claude-code/session-hygiene.hooks.json`, `config/external/claude-code/README.md`
- **Gate**: memory tests + hook JSON validation
- **Acceptance**: a compaction boundary can request a small advisory; it
  reports only action/reason/freshness and never creates or overwrites memory.

### S3 — Make the semantic checkpoint responsibility explicit
- **Status**: done
- **Files**: `docs/mcp-vertex/examples/host-checkpoint-adapter.md`, `docs/mcp-vertex/AGENT-BOOTSTRAP.md`, `docs/mcp-vertex/wiki/external/claude-code.md`
- **Gate**: docs/link checks + bootstrap budget check
- **Acceptance**: hosts receive a short protocol for creating an explicit
  digest before compaction; detailed guidance stays on demand, not bootstrap.

## acceptance

- A missing/stale checkpoint becomes visible at an actual host boundary.
- The only component allowed to write a semantic digest remains the active
  agent, using its real task state.
