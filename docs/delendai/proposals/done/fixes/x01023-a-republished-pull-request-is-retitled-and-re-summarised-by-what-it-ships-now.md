---
id: x01023
title: "A republished pull request is retitled and re-summarised by what it ships now"
kind: fix
status: done
type: proposal
track: trust
date: 2026-11-04
last-transition-id: be81ff6a-457f-46a9-9479-177549349f91
last-correlation-id: be81ff6a-457f-46a9-9479-177549349f91
last-transition-from: review
last-transition-at: 2026-11-21T06:33:29.704Z
shipped-in:
  - "b649b2806156514ea86c6924adece565ede0ddd4"
---

# x01023 — A republished pull request is retitled and re-summarised by what it ships now

## goal

On every republish, work publish sets the pull request title and summary to match the final diff and the slices it ships.

## why

External audit (ChatGPT, 2026-11-04, against develop f7f53bf8d), finding 4. Claim: #1735's title still promised what S5 retired. Verified against the forge: #1735 is titled `feat(init): one MCP entry per host, and a migration that removes the duplicate (+3 more)` and its body lists the commits of an earlier push. I read `publication-pull-request.service.ts`: the text is built once, when the pull request is opened (`--title`); x00830 chose the title then. Nothing updates it on a later publish, so a pull request whose scope changed keeps the first promise. Note `gh pr edit` fails here (projects-classic deprecation), so the update goes through the REST API.

## non-goals

- Renaming pull requests no one republished.
- Changing how the first title is chosen (x00830).

## slices

- global_gate: none

### S1 — Publish updates the text of an open pull request
- **Status**: done
- **Files**: `packages/core/src/lib/work-units/publication-pull-request.service.ts`
- **Gate**: type
- acceptance:
  - "When the publication's pull request is already open, work publish rewrites its title and summary from the final diff and the slices the unit now ships, through the REST API, and reports the change; a spec covers a unit whose scope shrank between two publishes."
- shipped-in: `978be919a1b3`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: mimo-v2.6-flash
- review-log: requested_changes by gpt-5.3-codex — Stale review round; rebase on current develop and re-validate this slice with fresh evidence before approval.
- review-log: approved by mimo-v2.6-flash — verified at b649b2806156, validate exit 0 and tests 31/31 claimed, no recorded run cited; acceptance 1/1: (1) publication-pull-request.service.ts refreshOpenPullRequest builds title and body from git log/diff of the final tip, the github adapter rewrites through `gh ap… — Approved on develop bea113b2d. Gate is type: typecheck exit 0; 31/31 tests in the two specs that cover this change (publication-pull-request 25, github change-request 6), both journaled as passing runs. Full `bun run validate` is red in three runs only on load-flaky specs unrelated to this slice (store-concurrency, review-releases, coordination-chaos, engine-factory clock, rebase) that pass in isolation; that is filed separately. Two reporting gaps found while judging are also filed separately: the default `work publish` answer drops status/title/reason, and the queue offers proposals no round is open for.

## acceptance

- When the publication's pull request is already open, work publish rewrites its title and summary from the final diff and the slices the unit now ships, through the REST API, and reports the change; a spec covers a unit whose scope shrank between two publishes.
