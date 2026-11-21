---
id: x01127
title: "The approval lint reads a branch name in the shape the policy replaced, so no review pack passes CI"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-11-21
last-transition-id: 460a2712-0e11-4ee4-8a3f-c856e874ff87
last-correlation-id: 460a2712-0e11-4ee4-8a3f-c856e874ff87
last-transition-from: ready
last-transition-at: 2026-11-21T11:21:37.759Z
---

# x01127 — The approval lint reads a branch name in the shape the policy replaced, so no review pack passes CI

## goal

closed-with-independent-approval reads the kind and the agent of a work or publication ref the way the policy writes them now, so a review pack is judged by what it is instead of by where its words sit, and a review unit's own approvals stop being refused.

## why

Since f00808 S8 landed (014e23ff50ec, 2026-11-18) this repository's template is `{wip|pr}/{action}/{agent}/{scope}/{topic}`: the first segment after the prefix is the action and the second is the agent. `kindOfRef` in `tools/scripts/lint/closed-with-independent-approval.script.ts` still reads `const [, kind, unit] = name.slice(bare.length).split('/')` and `agentOfRef` its mirror, which is the shape f00808 replaced. On a review pack the kind comes out as the agent (`mimo-v2.6-flash`) and the agent as the scope (`batch-all/review-batch-mimo`), so `agent !== 'review'` and the guard fires 'An approval enters through a review unit' on a ref that IS the review unit. Observed three ways: a direct probe prints `agent=mimo-v2.6-flash kind=mimo-v2.6-flash` for a `pr/review/mimo-v2.6-flash/batch-all/review-batch-mimo` head; a direct run exits 1 with that message and `lint:job:governance` reports 31/32; and PR #3420, a review pack whose diff is exactly one proposal's review state, is red in `static-checks-c` with `delendai-validate: FAILED (18/19 checks); failures=static-checks-c=failure`. Every review pack published since that commit carries a kind-first name, so the lint refuses all of them and review verdicts cannot reach develop. f00808's acceptance already asks that every parser read the trailer identity first and fall back to the name, but none of its slices owns this script's segment order: S4 owns the file only for prefixes, S9c and S9e are scoped to `packages/core/src`, so the gap is real and unserved.

## non-goals

- What the lint refuses does not change: an agent's own approvals still require a review unit. Only how kind and agent are read from the ref changes.
- No other lint script is touched; ref-lifecycle-guard and agent-claims already take their prefixes from the policy.
- No existing ref is renamed, and no proposal's review state is rewritten.

## slices

- global_gate: lint

### S1 — kindOfRef and agentOfRef read the shape the policy writes
- **Status**: pending
- **Files**: `tools/scripts/lint/closed-with-independent-approval.script.ts`, `tools/scripts/lint/closed-with-independent-approval.script.spec.ts`
- **Gate**: lint
- **Decisions**: none
- acceptance:
  - "On this repository's policy (namespacePrefix empty, template `{wip|pr}/{action}/{agent}/{scope}/{topic}`) the head `pr/review/mimo-v2.6-flash/batch-all/review-batch-mimo` classifies as kind `review` and agent `mimo-v2.6-flash`, and a `pr/implement/<agent>/...` head classifies as `implement` - the kind is no longer read from the second segment."
  - "A ref under the former prefix, `delendai/pr/review/<agent>/...`, classifies the same way, so the transition keeps working and a legacy name does not become an unrecognised ref."
  - "`isRevalidationRef` recognises `pr/revalidation/<agent>/...` under the current shape."
  - "Spec: a fixture whose head is `pr/review/<agent>/...` and whose diff adds an approval by `<agent>` fails with the message naming an approval entering through a review unit; the same fixture with an `implement` head and the same approval passes, so the test pins both directions."
  - "`bun tools/scripts/lint/closed-with-independent-approval.script.ts` exits 0 on the pull request this repository has open with head `pr/review/mimo-v2.6-flash/batch-all/review-batch-mimo`, and `lint:job:governance` reports 32/32."

## acceptance

- On this repository's policy (namespacePrefix empty, template `{wip|pr}/{action}/{agent}/{scope}/{topic}`) the head `pr/review/mimo-v2.6-flash/batch-all/review-batch-mimo` classifies as kind `review` and agent `mimo-v2.6-flash`, and a `pr/implement/<agent>/...` head classifies as `implement` - the kind is no longer read from the second segment.
- A ref under the former prefix, `delendai/pr/review/<agent>/...`, classifies the same way, so the transition keeps working and a legacy name does not become an unrecognised ref.
- `isRevalidationRef` recognises `pr/revalidation/<agent>/...` under the current shape.
- Spec: a fixture whose head is `pr/review/<agent>/...` and whose diff adds an approval by `<agent>` fails with the message naming an approval entering through a review unit; the same fixture with an `implement` head and the same approval passes, so the test pins both directions.
- `bun tools/scripts/lint/closed-with-independent-approval.script.ts` exits 0 on the pull request this repository has open with head `pr/review/mimo-v2.6-flash/batch-all/review-batch-mimo`, and `lint:job:governance` reports 32/32.
