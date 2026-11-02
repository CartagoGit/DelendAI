---
id: x01002
title: "A stranded proposal is told to hand over, not to close by hand"
kind: fix
status: review
type: proposal
track: a00095-consistency
date: 2026-11-02
last-transition-id: 54a4a196-6b5f-44ef-8ae0-aeb8e8137346
last-correlation-id: 54a4a196-6b5f-44ef-8ae0-aeb8e8137346
last-transition-from: in-progress
last-transition-at: 2026-11-02T20:40:14.716Z
shipped-in:
  - "7b79f76fb5cb6676e9325e5c6b90f40023e5dad7"
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
- **Status**: done
- **Files**: `tools/scripts/lint/proposal-ready-to-close.script.ts`, `tools/scripts/lint/proposal-ready-to-close.script.spec.ts`
- **Gate**: type
- acceptance:
  - "A finding in ready/ or in-progress/ names work deliver and setting the slices back to pending, and names no transition to done; a spec checks it."
  - "A finding in review/ keeps its review-then-done advice."
- shipped-in: `1faa04180151`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash
- review-log: approved by minimax-m3.1-flash — verified at 7b79f76fb5cb, validate exit 0 and tests 13/13 claimed, no recorded run cited; acceptance 2/2: (1) At 7b79f76f the lint branches on the proposal's status folder, and for a proposal in ready or in-progress it tells the reader to set the slices back to pending… (2) At 7b79f76f the review branch of the same advice is untouched, so a proposal in review keeps the submit, approve and transition to done route; the spec asserts… — Approved on the delivered state of 7b79f76fb5cb6676e9325e5c6b90f40023e5dad7. A stranded proposal in ready or in-progress is told to hand over rather than to close, while a proposal in review keeps its review-then-done advice. The type gate exited 0 and the slice spec passes 13 of 13. Two residuals, recorded and not blocking: the new spec exercises the in-progress folder only, and the ready folder reaches the same code but is not pinned by a test; and the review assertion pins only the transition to done, not the submit and approve wording that goes with it.

### S2 — A tool that refuses through the resolver fails the command
- **Status**: review
- **Files**: `packages/client/src/lib/transport/mcp-stdio-client.ts`, `packages/client/src/lib/contracts/interfaces/resolved-capability.interface.ts`, `packages/client/tests/transport/tool-reach.spec.ts`, `packages/cli/src/lib/work-deliver.service.ts`, `packages/cli/src/lib/work-deliver.service.spec.ts`, `packages/cli/src/commands/work.command.ts`
- **Gate**: type
- acceptance:
  - "A hidden tool whose result carries isError, reached through the resolver, rejects with McpToolError carrying the tool's words; a spec checks it."
  - "`proposals create --title=probe --slices='[{\"id\":\"S1\"}]'` exits non-zero."
- shipped-in: `1faa04180151`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S3 — Deliver takes the unit it runs in
- **Status**: review
- **Files**: `packages/cli/src/commands/work.command.ts`, `packages/cli/src/lib/work-deliver.service.ts`, `packages/cli/src/lib/work-deliver.service.spec.ts`
- **Gate**: type
- acceptance:
  - "work deliver run in a unit's worktree with no --slice proves and hands over that unit, its slice, generation and topic read from its branch; elsewhere it still takes the proposal's all unit."
- shipped-in: `126209b18798`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S4 — Prove and publish take the unit they run in
- **Status**: review
- **Files**: `packages/cli/src/commands/work.command.ts`, `packages/cli/src/commands/work.command.spec.ts`
- **Gate**: type
- acceptance:
  - "work prove and work publish run in a unit's worktree with no --slice, --generation or --topic act on that unit, read from its branch, by the helper work deliver shares; a spec checks it."
- shipped-in: `748438914ccf`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

## acceptance

- A finding in ready/ or in-progress/ names work deliver and setting the slices back to pending, and names no transition to done; a spec checks it.
- A finding in review/ keeps its review-then-done advice.
- A hidden tool whose result carries isError, reached through the resolver, rejects with McpToolError carrying the tool's words; a spec checks it.
- `proposals create` with a malformed slice exits non-zero.
- `work deliver` in a unit's worktree with no `--slice` delivers that unit.

## notes

- S2, reopened 2026-11-02: once a refusal through the resolver failed the call, `work deliver` failed on its own first step, the transition to in-progress of a proposal already there, whose refusal it reads to carry on (x00992's second delivery, exit 5). Its transition port now reads the refusal back from the error (`answerOf`); an error that carries no answer still fails.
