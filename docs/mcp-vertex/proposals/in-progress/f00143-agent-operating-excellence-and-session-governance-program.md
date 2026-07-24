---
id: f00143
title: "Agent operating excellence and session governance program"
kind: feat
status: review
type: proposal
track: agent-discipline+session-governance
date: 2026-07-24
---

# f00143 — Agent operating excellence and session governance program

## Goal

Establish a measurable, host-honest operating system that keeps agents disciplined, sessions bounded, context compact, and MCP payloads lean across every mcp-vertex consumer.

## why

Host dashboards show that costly behaviour is dominated by long-lived sessions
and large carried context, not a single bad tool call. The server can reduce
what it emits and preserve a compact handoff, but it must never pretend to know
a host's private quota or conversation meter. This programme joins measurable
local evidence, bounded advice, host-owned lifecycle integration and regression
budgets into one operating model.

## non-goals

- It does not try to terminate, compact or clear a host conversation from the
  MCP server.
- It does not estimate subscription spend from local tool metadata.
- It does not make a full preset unavailable; lightweight activation stays an
  explicit, reversible choice.

## Slices

- global_gate: validate

### S1 — Local evidence and bounded advice
- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/ready/f00144-session-hygiene-observability-and-advisory-alerts.md`
- **Gate**: plugin tests + typecheck

### S2 — Real host lifecycle boundaries
- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/ready/f00145-host-lifecycle-checkpoint-adapters.md`
- **Gate**: host-adapter contract tests

### S3 — Lean activation and regression budgets
- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/ready/c00089-lean-activation-and-full-preset-context-budgets.md`
- **Gate**: token-budget e2e + validate

### S4 — Policy and adoption feedback loop
- **Status**: done
- **Files**: `docs/mcp-vertex/AGENT-BOOTSTRAP.md`, `docs/mcp-vertex/CROSS-PROJECT-SETUP.md`
- **Gate**: prompt-size + docs checks
- **Note**: keep the always-loaded policy short; detailed runbooks must remain
  lazy knowledge so the cure never becomes context bloat.

## acceptance

- Local observability labels its evidence as MCP-only and never as a host quota.
- A session crosses a policy threshold at most once per reason, avoiding alert
  loops and extra context churn.
- Host adapters remain opt-in and own only host lifecycle glue; core stays
  host-agnostic.
- The full surface used by consumers has a measured context budget, while a
  smaller activation path stays available for ordinary work.
