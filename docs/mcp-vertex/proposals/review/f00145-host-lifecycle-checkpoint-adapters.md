---
id: f00145
title: "Host lifecycle checkpoint adapters"
kind: feat
status: review
type: proposal
track: host-adapters+memory
date: 2026-07-24
closed-by: copilot-minimax-m3 (close pass 2026-07-24)
closed-evidence:
  - S1+S2+S3 landed: 2e471ee8 feat: add host lifecycle checkpoint adapters
---

# f00145 — Host lifecycle checkpoint adapters

## Goal

Provide opt-in host adapters that checkpoint and rehydrate useful state at real host lifecycle boundaries while keeping host-specific behavior out of core.

## why

Only the host knows when a conversation is about to compact, end, resume, or
show a quota warning. The server should provide a small portable checkpoint
packet, while host adapters invoke it at real lifecycle boundaries. This closes
the gap that a generic MCP server cannot safely infer from tool timestamps.

## non-goals

- No host-specific vocabulary or SDK imports in `packages/core`.
- No unsupported claim that every host exposes identical lifecycle hooks.
- No background polling to discover a host state that the host has not exposed.

## Slices

- global_gate: validate

### S1 — Portable checkpoint packet contract
- **Status**: done
- **Files**: `plugins/memory/src/lib/services/`, `plugins/memory/src/lib/tools/`, `plugins/memory/tests/src/lib/`
- **Gate**: memory tests
- review-state: in_review
- review-implementer: copilot-minimax-m3
- **Acceptance**: a bounded, redacted packet contains only the current digest,
  pointers and next action; it is useful without a host adapter.

### S2 — Claude Code adapter research and implementation
- **Status**: done
- **Files**: `config/external/claude-code/`, `docs/mcp-vertex/wiki/external/claude-code.md`, host-adapter tests
- **Gate**: documented host smoke test
- review-state: in_review
- review-implementer: copilot-minimax-m3
- **Acceptance**: use only documented current lifecycle hooks; if no supported
  hook can invoke MCP, ship instructions rather than a fake integration.

### S3 — Generic adapter seam and adoption samples
- **Status**: done
- **Files**: `docs/mcp-vertex/examples/`, `docs/mcp-vertex/CROSS-IDE.md`
- **Gate**: docs/link checks
- review-state: in_review
- review-implementer: copilot-minimax-m3
- **Acceptance**: each adapter is opt-in, names the exact lifecycle guarantee,
  and degrades to the portable checkpoint packet.

## acceptance

- A host can retain the minimum continuation state without preserving raw tool
  output.
- The core remains host-agnostic and adapters never receive secrets or full
  transcripts.
- Unsupported hosts get a truthful manual flow, not an inert configuration.
