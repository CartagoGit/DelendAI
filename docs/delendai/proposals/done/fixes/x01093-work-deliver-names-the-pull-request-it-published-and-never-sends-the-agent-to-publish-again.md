---
id: x01093
title: "work deliver names the pull request it published, and never sends the agent to publish again"
kind: fix
status: done
type: proposal
track: fixes
date: 2026-11-18
last-transition-id: 6d1ac14f-fe1a-47c5-9f34-b5fbe913128c
last-correlation-id: 6d1ac14f-fe1a-47c5-9f34-b5fbe913128c
last-transition-from: review
last-transition-at: 2026-11-19T23:21:31.923Z
shipped-in:
  - "1466311d6921d578e8502dc205164aadfb2b8346"
---

# x01093 — work deliver names the pull request it published, and never sends the agent to publish again

## goal

When deliver's publication has pushed the branch but its answer holds no pull request, deliver looks the pull request up by head branch on the forge and answers with its number and url; when none exists yet it answers that the forge opens it and that nothing is left to do, naming `work status` as the place the number appears, never a publish step.

## why

Twice on 2026-11-18 (x01090 #2905, x01091 #2919) deliver answered 'publication pushed, pull request pending' while the pull request already existed and the unit had ended at hand-over; each agent then ran `work publish`, which refused with 'resolve-work-ref: ... does not exist'. A message that implies a next step that cannot succeed makes every host and model loop, and costs a proof slot's worth of agent turns each time.

## non-goals

- Changing who opens the pull request or when.
- Waiting or polling for the forge to open it.

## slices

- global_gate: lint

### S1 — deliver reads the pull request by head branch before answering pending
- **Status**: done
- **Files**: `packages/cli/src/lib/work-deliver.service.ts`, `packages/cli/src/lib/work-deliver.service.spec.ts`
- **Gate**: lint
- acceptance:
  - "pullRequestAnswer gains a port that reads the open pull request for the published branch through the existing forge seam (one read, no retry loop); when it finds one, deliver answers { url, number } exactly as when publication returned it."
  - "When none is found, the answer is { pending: true, branch, message } with a message saying the branch is pushed, the forge opens the pull request, nothing is left to do in this unit, and `delendai work status` shows its number; the message names no publish command."
  - "work-deliver.service.spec.ts covers: publication with a pull request; publication without one and the forge read finding it; neither; and a forge read that fails, which answers pending without throwing."
- shipped-in: `e550ed211370`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: mai-code-2
- review-log: approved by mai-code-2 — verified at 1466311d6921, validate exit 0 and tests 24/24 claimed, no recorded run cited; acceptance 3/3: (1) pullRequestWithLookup calls ports.readOpenPullRequest exactly once for a pending answer, catches any error, and feeds a found URL through pullRequestOf, yieldi… (2) pullRequestOf returns pending/branch/message and the spec asserts the exact status reference, `nothing is left to do`, and absence of `work publish` for both n… (3) Dedicated tests cover publication-provided URL, lookup-found URL, missing PR pending, and thrown forge read pending; all 24 tests in the file pass. — Reviewed the delivered diff and current implementation. The 24 focused specs pass and the lint gate exits 0. A single forge lookup resolves an already-open PR; failures and absence produce an actionable pending message that explicitly says nothing remains and never tells the agent to publish again.

## acceptance

- pullRequestAnswer gains a port that reads the open pull request for the published branch through the existing forge seam (one read, no retry loop); when it finds one, deliver answers { url, number } exactly as when publication returned it.
- When none is found, the answer is { pending: true, branch, message } with a message saying the branch is pushed, the forge opens the pull request, nothing is left to do in this unit, and `delendai work status` shows its number; the message names no publish command.
- work-deliver.service.spec.ts covers: publication with a pull request; publication without one and the forge read finding it; neither; and a forge read that fails, which answers pending without throwing.
