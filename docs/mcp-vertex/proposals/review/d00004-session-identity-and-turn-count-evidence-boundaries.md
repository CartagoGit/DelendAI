---
id: d00004
title: "Session identity and turn-count evidence boundaries"
kind: docs
status: review
type: proposal
track: agent-discipline+host-adapters
date: 2026-07-24
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
- **Files**: `docs/mcp-vertex/CROSS-IDE.md`, `config/external/claude-code/README.md`
- **Gate**: docs/link checks
- **Acceptance**: installation guidance distinguishes MCP-only observations,
  explicit host lifecycle observations, and literal id matching.

### S2 — Keep the operational rule compact and universal
- **Status**: done
- **Files**: `docs/mcp-vertex/AGENT-BOOTSTRAP.md`, `docs/mcp-vertex/TOKEN-BUDGETS.md`
- **Gate**: bootstrap budget check
- **Acceptance**: the bootstrap directs agents to checkpoint/compact on host
  warnings without claiming the server can see a host quota; detailed host
  mechanics remain under demand-loaded docs.

## acceptance

- Users can interpret each counter's source and precision before acting on it.
- A host that emits lifecycle events gains turn count without an MCP result on
  every turn; other hosts degrade to MCP-only observations.
