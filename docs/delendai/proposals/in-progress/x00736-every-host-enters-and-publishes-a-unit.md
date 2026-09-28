---
id: x00736
title: "Every host enters and publishes a unit"
kind: fix
status: in-progress
type: proposal
track: hosts
date: 2026-09-28
priority: P0
related: [x00714, x00731, x00735]
---

# x00736 — Every host enters and publishes a unit

## goal

A host that reaches delendai only through MCP enters, claims, checkpoints
and publishes its unit of work exactly as a terminal does, through the same
engine, and two instances of one model never share a unit.

## why

The owner asked that delendai work the same whatever host or model drives
it. The unit lifecycle was reachable only from a terminal
(`delendai work …`): a chat host with MCP and no shell could read the review
queue and record verdicts, and never had a unit to record them in. x00735
moved the engine into core; this exposes it.

## why this design

- **The MCP `work` tool runs `runWorkUnit`**, the engine behind the CLI's
  `work`, with the same operations (`status`, `swarm`, `doctor`, `claim`,
  `enter`, `checkpoint`, `publish`) and the same inputs as fields. Nothing
  about a unit is decided twice.
- **The session is the server's.** One server serves one conversation, so
  every call keeps its unit without passing anything, and two instances of
  one model, each with its own server, get their own generation (x00714,
  x00731). A call may still name a session.
- It is a core tool, so the agent catalog, the token budgets and the
  generated documentation know it like every other.

## non-goals

- The review flow (`review next / approve / changes / finish`) over MCP:
  the next proposal.

## architecture

- `packages/core/src/lib/tools/work-unit.tool.ts` (new), registered in
  `cli/assemble-core-tools.ts`; its options in
  `contracts/interfaces/work-unit-context.interface.ts`.

## Slices

- global_gate: none

### S1 — The work tool

- **Status**: in-progress
- **Gate**: `npx vitest run packages/core/tests/src/lib/tools/work-unit.tool.spec.ts`
- **Files**:
  - `packages/core/src/lib/tools/work-unit.tool.ts`
  - `packages/core/src/lib/cli/assemble-core-tools.ts`
  - `packages/core/src/lib/contracts/interfaces/work-unit-context.interface.ts`
  - `packages/core/src/generated/tool-outputs.ts`
  - `packages/core/tests/src/lib/tools/work-unit.tool.spec.ts`

## dependency graph

None.

## acceptance

- `work { action: "enter", kind: "review", proposal: "batch", slice: "all",
  agent }` returns a worktree and work ref; a second call from the same
  server returns the same unit.
- Two servers of one model entering together get g1 and g2.
