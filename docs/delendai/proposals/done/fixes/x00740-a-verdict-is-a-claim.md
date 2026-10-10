---
id: x00740
title: "A verdict is a claim"
kind: fix
status: done
type: proposal
track: hosts
date: 2026-09-28
priority: P1
related: [x00737, x00739]
last-transition-id: 6468eda8-134e-4950-b273-2fd3acfe778c
last-correlation-id: 6468eda8-134e-4950-b273-2fd3acfe778c
last-transition-from: review
shipped-in:
  - "51aabcbd0"
---

# x00740 — A verdict is a claim

## goal

Two review units never judge the same proposal, whether or not a reviewer
remembered to claim it first. What a verdict writes reads as the proposal
did before it, and a unit's name stays short enough to read.

## why

A swarm of `minimax-3` and `glm-5.3-max` reviewers, watched on 2026-09-28:

- A unit approved x00604 and x00606 without claiming them. Nothing reads a
  verdict as a claim, so another unit claimed x00604 later, and two units
  judged x00595 and x00621: one approved, the other reopened. Their pull
  requests disagree about where the proposal lives.
- A claim was made with `git commit --allow-empty`. That commits whatever
  is staged, so anything a reviewer had staged rode along in the claim.
- Each verdict glued the next heading to the review log (`- review-log: …`
  followed directly by `## acceptance`): the slice body was trimmed and
  ended with a single newline.
- A reviewer entered a unit whose topic listed every proposal in its pack.
  The branch name was 200 characters long and unreadable in any list.

## why this design

- One claim service, used by `review_claim` and by `proposal_review`. A
  verdict (`approve`, `request_changes`) recorded in a review unit claims
  the proposal first. If another unit holds it, the verdict is refused and
  the proposal file is left as it was. Outside a review unit nothing
  changes, so implementers and projects without units work as before.
- The claim commit is `git commit --only --allow-empty` with no paths: it
  holds the claim alone, leaves the index as it was, and still runs the
  hooks.
- `withClosingLines` ends the review lines with a blank line when a heading
  follows, and with one newline at the end of the document. It also mends a
  slice written by the old code.
- `work enter` refuses a new unit whose topic is longer than 48 characters
  and says why. An existing unit is never refused, so units in flight keep
  their names.

## non-goals

- Reading older verdict commits, which carry no `Claims` trailer, as
  claims. Their units publish as before.

## architecture

- `plugins/proposals/src/lib/services/review-claim.service.ts` (new),
  `tools/review-claim.tool.ts`, `tools/authoring.tool.ts`,
  `swarm/proposal-review.ts`, `services/review-handoff.ts`.
- `packages/core/src/lib/work-units/work-unit-enter.service.ts`,
  `contracts/constants/work-topic.constant.ts`.

## Slices

- global_gate: none

### S1 — Verdicts claim, claims commit alone, review lines keep the blank line

- **Status**: done
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/tools/proposal-review-claim.spec.ts plugins/proposals/tests/src/lib/tools/review-claim.tool.spec.ts packages/core/tests/src/lib/work-units/work-unit.service.spec.ts`
- **Files**:
  - `plugins/proposals/src/lib/contracts/interfaces/review-claim-outcome.interface.ts`
  - `plugins/proposals/src/lib/services/review-claim.service.ts`
  - `plugins/proposals/src/lib/services/review-claims.service.ts`
  - `plugins/proposals/src/lib/services/review-handoff.ts`
  - `plugins/proposals/src/lib/swarm/proposal-review.ts`
  - `plugins/proposals/src/lib/tools/authoring.tool.ts`
  - `plugins/proposals/src/lib/tools/review-claim.tool.ts`
  - `plugins/proposals/tests/src/lib/tools/proposal-review-claim.spec.ts`
  - `plugins/proposals/tests/src/lib/tools/review-claim.tool.spec.ts`
  - `packages/core/src/lib/contracts/constants/work-topic.constant.ts`
  - `packages/core/src/lib/work-units/work-unit-enter.service.ts`
  - `packages/core/tests/src/lib/work-units/work-unit.service.spec.ts`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3
- review-log: approved by minimax-m3 — Revisé 51aabcbd0 (x00740 S1, merge PR #608). review-claim.service.ts + review-claim.tool.ts + authoring.tool.ts + swarm/proposal-review.ts: un verdict en un review unit sobre propuesta no reclamada deja un commit Claims en la unidad; sobre propuesta retenida por OTRA unidad es rechazado incluso con el mismo modelo, archivo sin cambios. El commit de claim no toca archivos (lo que esté stageado sigue stageado). withClosingLines termina las líneas de review con blank line antes del heading y mendiga slices escritos por el viejo código. work enter rechaza topic > 48 chars sin crear ref. 51/51 verde. claude-opus-5-5 != minimax-m3 → veredicto independiente.
- review-attribution: claude-opus-5-5 from commit 51aabcbd0c4c names refs/heads/delendai/wip/claude-opus-5-5/implement/x00740-S1-g1/a-verdict-is-a-claim (51aabcbd0c4c73ce6907c3b12ba8fb313b21186b), opened by minimax-m3

## dependency graph

None.

## acceptance

- A verdict in a review unit on an unclaimed proposal leaves a `Claims`
  commit in the unit. A verdict on a proposal another unit holds is
  refused, even under the same model name, and the file is unchanged.
- A claim commit changes no file, and what was staged stays staged.
- After a verdict, the heading that follows the slice has its blank line.
- `work enter` with a 60-character topic creates no ref and says why.
