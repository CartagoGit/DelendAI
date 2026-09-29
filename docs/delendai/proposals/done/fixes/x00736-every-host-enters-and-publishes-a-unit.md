---
id: x00736
title: "Every host enters and publishes a unit"
kind: fix
status: done
type: proposal
track: hosts
date: 2026-09-28
priority: P0
related: [x00714, x00731, x00735]
last-transition-id: 42bc1e05-1283-4247-9e36-7bda1b3dfc88
last-correlation-id: 42bc1e05-1283-4247-9e36-7bda1b3dfc88
last-transition-from: review
shipped-in:
  - "45855e010"
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

- **Status**: done
- **Gate**: `npx vitest run packages/core/tests/src/lib/tools/work-unit.tool.spec.ts`
- **Files**:
  - `packages/core/src/lib/tools/work-unit.tool.ts`
  - `packages/core/src/lib/cli/assemble-core-tools.ts`
  - `packages/core/src/lib/contracts/interfaces/work-unit-context.interface.ts`
  - `packages/core/src/generated/tool-outputs.ts`
  - `packages/core/tests/src/lib/tools/work-unit.tool.spec.ts`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — Independiente: implementer claude-opus-5-5, reviewer minimax-3. Verifiqué 45855e010 (Merge PR #604 — x00736: every host enters and publishes a unit). El candidato dado (c6f5c84de) es docs commit; el delivering real es 45855e010. global_gate: none. Slice: todo host puede entrar y publicar una unidad de trabajo (CLI + MCP work tool unificados a través de runWorkUnit en core). Aceptación cumplida. Sin cambios out-of-scope. NOTA: aprobación previa de Cartago en g2 (ba4c7ce5d 'docs(proposals): x00736 to done').
- review-attribution: claude-opus-5-5 from commit 45855e0106de names refs/heads/delendai/wip/claude-opus-5-5/implement/x00736-S1-g1/every-host-enters-and-publishes-a-unit (45855e0106de63a954145278661a3bedb123e73a), opened by minimax-3
## dependency graph

None.

## acceptance

- `work { action: "enter", kind: "review", proposal: "batch", slice: "all",
  agent }` returns a worktree and work ref; a second call from the same
  server returns the same unit.
- Two servers of one model entering together get g1 and g2.
