---
id: d00004
title: "Session identity and turn-count evidence boundaries"
kind: docs
status: done
type: proposal
track: agent-discipline+host-adapters
date: 2026-07-24
closed-by: cartago (close pass 2026-07-24, restored 2026-07-26)
closed-evidence:
  - S1 + S2 documented in CROSS-IDE.md and config/external/claude/README.md
  - docs/mcp-vertex/AGENT-BOOTSTRAP.md updated with checkpoint/compact guidance
shipped-in:
  - a921589d # feat: advise checkpoint freshness at host boundaries
  - dd7ba156 # feat: capture Claude lifecycle session evidence
  - db388195 # move to review/
---

# d00004 — Session identity and turn-count evidence boundaries

## Goal

Document the distinction between boot-scoped MCP ids and host conversation ids, and define a no-context-tax turn-count path for adapters that can emit lifecycle events.

## why

The local MCP server generates a boot-scoped fallback id, while hosts can use
their own conversation ids. Treating them as interchangeable produces a
plausible but false usage diagnosis. The lifecycle adapter provides a cheap
turn count only where a host emits an explicit event.

## non-goals

- No claimed universal session identifier across Claude, Codex, MCP clients,
  or providers.
- No hidden prompt or transcript inspection to infer turns.

## Slices

- global_gate: docs/link checks + bootstrap budget check

### S1 — Document identity and evidence boundaries for adopters
- **Status**: done
- **Files**: `docs/mcp-vertex/CROSS-IDE.md`, `config/external/claude/README.md`
- **Gate**: docs/link checks
- **Acceptance**: installation guidance distinguishes MCP-only observations,
  explicit host lifecycle observations, and literal id matching.
- review-state: done
- review-implementer: copilot-minimax-m3
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — CROSS-IDE.md and config/external/claude/README.md correctly distinguish MCP-only vs explicit host-lifecycle vs literal-id matching.
### S2 — Keep the operational rule compact and universal
- **Status**: done
- **Files**: `docs/mcp-vertex/AGENT-BOOTSTRAP.md`, `docs/mcp-vertex/TOKEN-BUDGETS.md`
- **Gate**: bootstrap budget check
- **Acceptance**: the bootstrap directs agents to checkpoint/compact on host
  warnings without claiming the server can see a host quota; detailed host
  mechanics remain under demand-loaded docs.
- review-state: done
- review-implementer: copilot-minimax-m3
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — AGENT-BOOTSTRAP.md and TOKEN-BUDGETS.md keep the operational rule compact and universal; no host-specific protocol burden.
## acceptance

- Users can interpret each counter's source and precision before acting on it.
- A host that emits lifecycle events gains turn count without an MCP result on
  every turn; other hosts degrade to MCP-only observations.
