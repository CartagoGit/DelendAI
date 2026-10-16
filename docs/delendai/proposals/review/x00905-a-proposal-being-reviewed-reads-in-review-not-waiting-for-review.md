---
id: x00905
title: "A proposal being reviewed reads in-review, not waiting for review"
kind: fix
status: review
type: proposal
track: general
date: 2026-10-15
last-transition-id: 0fae5b4a-f986-45a9-9fec-f9ebbe61a3d5
last-correlation-id: 0fae5b4a-f986-45a9-9fec-f9ebbe61a3d5
last-transition-from: in-progress
last-transition-at: 2026-10-15T16:54:40.657Z
---

# x00905 — A proposal being reviewed reads in-review, not waiting for review

## goal

Work waiting for a reviewer and work a reviewer is on read differently everywhere the project shows a proposal's state, as `ready` and `in-progress` do for implementation; one source of truth decides which; and a review moves its proposal on only when it ends: to `done` when every slice is approved, to `ready` with its findings when any is sent back, back to waiting when it stopped without judging everything.

## why

The owner, 2026-10-15: "no es lo mismo que algo falte por revisar a que se esté revisando por agente … el hecho de estar únicamente en review no da información de que está siendo revisado". `proposals status` printed `review: 12` with a swarm of reviewers at work: which of the twelve had somebody on them, and which waited, nothing said.

Two more faults sit in the same transition:

- The first change request moves the proposal straight to `in-progress` (`review-verdict-lifecycle.ts`, `reopen`), while its reviewer may still be judging its other slices: the proposal reads as being implemented while it is still being reviewed, and its other verdicts land on a proposal that left review.
- A review that stops half way (a claim given back, or lapsed when its reviewer went quiet) leaves no state saying the proposal is waiting again, other than the absence of a claim nobody can see in the board.

## why this design

The claim is already the one fact that says a reviewer is on a proposal: it is a commit in the reviewer's unit, on the forge as soon as it is made, it lapses when its holder goes quiet (x00901 S5) and ends when its pack lands or is retired. A folder (`in-review/`) moved by the claim would land only when the reviewer's pack merges — after the review is over — and every pack would move files under the others, the conflicts that already cost verdicts. So `in-review` is a status the board derives: a proposal in `review/` with a holding claim is `in-review`; without one it is `review`, waiting. One function decides it, and every surface asks that function.

The end of a review is a fact too: the reviewer publishes its pack (`review finish` / `work publish`). That is when the proposal moves, not at each verdict.

## non-goals

- A new folder or a frontmatter field for `in-review`: the claim is the record.
- Changing who may review, or how a claim is taken, held or lapses.

## slices

- global_gate: type

### S1 — One function says whether a proposal in review is being reviewed

- **Status**: review
- **Files**:
  - `plugins/proposals/src/lib/services/review-state.service.ts`
  - `plugins/proposals/src/lib/contracts/interfaces/review-state.interface.ts`
  - `plugins/proposals/tests/src/lib/services/review-state.service.spec.ts`
- **Gate**: type
- acceptance:
  - `reviewStateOf` takes a proposal in `review/` and the claims as `reviewClaims` reads them with the holding rule (`claimHolding`), and answers `in-review` (with the holders and since when) or `review` (waiting); nothing else decides it.
- shipped-in: `bdc86aba834f`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S2 — Every surface shows in-review apart from review

- **Status**: review
- **Files**:
  - `plugins/proposals/src/lib/tools/compact-status.tool.ts`
  - `plugins/proposals/src/lib/tools/proposal-board.tool.ts`
  - `extensions/vscode/src/providers/proposal-board-provider.ts`
  - `extensions/vscode/src/test/proposals-board.spec.ts`
  - `plugins/proposals/tests/src/lib/tools/compact-status-units.spec.ts`
- **Gate**: type
- acceptance:
  - `proposals status` counts `in-review` and `review` apart (`byStatus`), the two adding up to what `review` counted before.
  - The board (with `progress`) gives a proposal under review the status `in-review`, through `reviewStateOf`; the editor's board groups it as "In review", apart from "Waiting for review".
  - The review queue needs nothing new: it already reads the same claims and offers no proposal another reviewer holds.
- review-state: in_review
- review-implementer: gpt-6
- shipped-in: `9274ca6dd959`

### S3 — A review moves its proposal when it ends, not at its first verdict

- **Status**: review
- **Files**:
  - `plugins/proposals/src/lib/tools/review-verdict-lifecycle.ts`
  - `plugins/proposals/src/lib/contracts/constants/proposal-glossary.constant.ts`
  - `plugins/proposals/src/lib/tools/authoring.tool.ts`
  - `plugins/proposals/src/lib/services/review-attribution.ts`
  - `plugins/proposals/tests/src/lib/tools/proposal-review-sent-back.spec.ts`
  - `plugins/proposals/tests/src/lib/tools/proposal-review-attribution.spec.ts`
  - `plugins/proposals/tests/src/lib/tools/proposal-review-claim.spec.ts`
  - `plugins/proposals/tests/src/lib/tools/review-repo.ts`
- **Gate**: type
- decision: the review ends when no slice of the proposal waits for a verdict (`reviewStanding`), whoever judged each and whenever its pack lands. That is the one moment every path shares — the CLI, the `work` tool, an MCP host — where a publication-time hook would have had to be wired into each.
- acceptance:
  - A change request records its finding on the slice, which reads `pending` (work to do again), and leaves the proposal in review while any slice still waits.
  - Once none waits: every slice approved → `done` (as before; a retired slice counts as reviewed); any slice sent back → `ready`, the finding on each slice sent back, for the next implementer to take (`review → ready` is admitted; `review → in-progress` stays for an implementer taking it back).
- review-state: in_review
- review-implementer: gpt-6
- shipped-in: `bdc86aba834f`

### S4 — A review that stopped half way reads waiting again

- **Status**: review
- **Files**:
  - `plugins/proposals/tests/src/lib/services/review-state.service.spec.ts`
- **Gate**: type
- acceptance:
  - A claim given back (or lapsed, or whose pack was retired) holds nothing, so the proposal reads `review` at once, through S1; the slices judged before keep their verdicts, and the review queue offers the rest.
- review-state: in_review
- review-implementer: gpt-6
- shipped-in: `bdc86aba834f`

## acceptance

- With reviewers at work, `proposals status` shows how many proposals are being reviewed and how many wait, and the two always add up to the proposals in review.
- No proposal leaves review while a reviewer is still on it; one that ends with findings is `ready` for its next implementer.
