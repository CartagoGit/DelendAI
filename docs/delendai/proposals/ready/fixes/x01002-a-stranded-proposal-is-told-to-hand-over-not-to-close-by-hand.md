---
id: x01002
title: "A stranded proposal is told to hand over, not to close by hand"
kind: fix
status: ready
type: proposal
track: a00095-consistency
date: 2026-11-02
---

# x01002 — A stranded proposal is told to hand over, not to close by hand

## goal

The delivery tooling tells an agent the truth about what failed and what to do. When every slice of a proposal in ready/ or in-progress/ is marked done, proposal-ready-to-close tells the agent the step that is legal there: set the slices back to pending and run work deliver, which moves them to review with their shipped-in. It no longer advises adding shipped-in by hand or a transition to done that the state machine refuses. A tool that refuses its input fails the CLI command that called it, whatever path the client took to reach the tool.

## why

Seen on 2026-11-02 delivering x00984 and x00989. Both implementers marked their slices done by hand before `work deliver`; the proof then failed on proposal-ready-to-close, whose advice was to add `shipped-in` by hand, open a review round and transition to done. Following it, the x00989 agent added `shipped-in` and failed the same way twice: the only legal step was to leave the slices pending, because the hand-over moves each to review and records its shipped-in itself (commit 260ecf695 shows it for v00154).

The same session, `proposals create` with a malformed `--slices` printed the validation issues on stdout and exited 0. The proposals tools are hidden on the managed surface, so the client reaches them through the capability resolver, and the resolved result was unwrapped as an answer without reading its `isError`. An agent that checks the exit code reads a refusal as success.

## non-goals

- Changing when a slice may be marked done, or what the hand-over records.
- The resolver's own refusals (`status` other than `ok`), which already fail.

## slices

- global_gate: type

### S1 — The stranded advice names the hand-over
- **Status**: pending
- **Files**: `tools/scripts/lint/proposal-ready-to-close.script.ts`, `tools/scripts/lint/proposal-ready-to-close.script.spec.ts`
- **Gate**: type
- acceptance:
  - "A finding in ready/ or in-progress/ names work deliver and setting the slices back to pending, and names no transition to done; a spec checks it."
  - "A finding in review/ keeps its review-then-done advice."

### S2 — A tool that refuses through the resolver fails the command
- **Status**: pending
- **Files**: `packages/client/src/lib/transport/mcp-stdio-client.ts`, `packages/client/src/lib/contracts/interfaces/resolved-capability.interface.ts`, `packages/client/tests/transport/tool-reach.spec.ts`
- **Gate**: type
- acceptance:
  - "A hidden tool whose result carries isError, reached through the resolver, rejects with McpToolError carrying the tool's words; a spec checks it."
  - "`proposals create --title=probe --slices='[{\"id\":\"S1\"}]'` exits non-zero."

## acceptance

- A finding in ready/ or in-progress/ names work deliver and setting the slices back to pending, and names no transition to done; a spec checks it.
- A finding in review/ keeps its review-then-done advice.
- A hidden tool whose result carries isError, reached through the resolver, rejects with McpToolError carrying the tool's words; a spec checks it.
- `proposals create` with a malformed slice exits non-zero.
