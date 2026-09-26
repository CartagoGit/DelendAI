---
id: x00659
title: "A certified integration branch vouches for a close"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-26
priority: P0
related: [x00653, x00637]
last-transition-id: bde49b53-66e4-443b-ae4f-7f37bf1e6573
last-correlation-id: bde49b53-66e4-443b-ae4f-7f37bf1e6573
last-transition-from: in-progress
---

# x00659 — A certified integration branch vouches for a close

## goal

A proposal whose every slice is approved can be closed. The evidence is
that its delivered commits were validated where they landed.

## why

On 2026-09-26 a reviewer (GLM) took the five oldest proposals in review.
Every slice was approved, and it could close none of them. Moving to
`done` needed a green local `bun run validate` from the last 24 hours,
in the checkout doing the close:

- The newest run on record was a failure from 2026-09-21.
- In the reviewer's fresh worktree, `validate` (128 steps, about 40
  minutes) failed 12 steps (typecheck, `check:generated`, `test`,
  `verify:*`) on what the worktree lacked: built packages and generated
  files. The delivered work was not the cause.

In a project whose work reaches the integration branch through pull
requests, a local validate is the weaker proof. The work already landed,
and the integration branch's full CI run certified the tree it landed
in. No proposal could reach `done`.

## why this design

The owner machine already asks the forge, on every hydration pass,
whether the integration tip has a full run (`certify-integration`). It
now also records what it saw, one line per verdict:
`{ sha, state: certified|red, timestamp }` in
`.cache/delendai/results/logs/integration-certification.jsonl`. The same
verdict for the same commit is recorded once.

`proposal_transition` to `done` accepts that as evidence when the local
validate is missing or stale, on two conditions:

- The **newest** recorded verdict is `certified`. An older green verdict
  cannot vouch for a tree that has since gone red, which is the
  principle the local gate already follows.
- That certified commit **contains every commit in `shipped-in`**
  (`merge-base --is-ancestor`).

`guardShippedInPresent` now returns the SHAs it validated, so the
commits are parsed once.

## non-goals

- `close_slice`'s validate requirement. That is slice-level and
  separate.
- Removing the local validate path, which still works when present.

## architecture

- `plugins/proposals/src/lib/services/integration-certification-evidence.service.ts`:
  the rule.
- `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`: local
  evidence, then certified delivery.
- `plugins/proposals/src/lib/services/proposal-state.ts`: `shas` on
  success.
- `plugins/proposals/src/lib/contracts/constants/proposal-paths.constant.ts`:
  the log path, once.
- `tools/scripts/forge/certify-integration.script.ts`: the writer.

## Slices

- global_gate: none

### S1 — The integration branch certification is evidence for a close

- **Status**: review
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/tools/proposal-transition.tool.spec.ts plugins/proposals/tests/src/lib/services tools/scripts/forge/certify-integration.script.spec.ts`
- **Files**:
  - `plugins/proposals/src/lib/services/integration-certification-evidence.service.ts`
  - `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`
  - `plugins/proposals/src/lib/services/proposal-state.ts`
  - `plugins/proposals/src/lib/contracts/constants/proposal-paths.constant.ts`
  - `tools/scripts/forge/certify-integration.script.ts`
  - `tools/scripts/forge/certify-integration.script.spec.ts`
  - `plugins/proposals/tests/src/lib/services/integration-certification-evidence.service.spec.ts`
  - `plugins/proposals/tests/src/lib/services/proposal-state.spec.ts`
  - `plugins/proposals/tests/src/lib/tools/proposal-transition.tool.spec.ts`
- review-state: in_review
- review-implementer: claude-opus-5-5
## dependency graph

None.

## acceptance

- With no local validate, a proposal whose shipped commit is contained
  in the newest certified integration commit closes to `done`.
- A newer red verdict refuses the close.
- A shipped commit the certified tree lacks refuses the close.
- The owner machine records a finished run once per commit and verdict,
  and records nothing for a run that is still pending.
