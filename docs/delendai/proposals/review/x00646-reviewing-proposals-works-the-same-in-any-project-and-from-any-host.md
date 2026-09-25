---
id: x00646
title: "Reviewing proposals works the same in any project and from any host"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-25
last-transition-id: 6e14363a-f203-4958-b3ca-2d5871e5d7da
last-correlation-id: 6e14363a-f203-4958-b3ca-2d5871e5d7da
last-transition-from: in-progress
---

# x00646 — Reviewing proposals works the same in any project and from any host

## Goal

An agent told to review the proposals in review — from Claude Code, Codex, Copilot, any MCP client or a bare console — finds every proposal awaiting review, learns for each slice what to verify and which commit delivered it, and leaves each one approved, sent back or blocked with the missing datum, in any project that adopts delendai, whatever its forge, merge style or ref naming.

## why

x00643 made a review possible where no round was ever opened, but by rules only this repository satisfies. The implementer is read from a `Merge pull request #N from owner/<prefix><agent>/...` subject: GitHub phrasing, a GitHub merge commit, and the agent assumed to be the first segment of the ref, although `branches.workRefTemplate` lets a project put it anywhere; a squash or rebase merge leaves no such subject at all. Nothing tells an agent the review backlog exists: the overview counts ready and in-progress work only, `get_proposal_workflow` describes the review loop from the implementer's side, and nothing lists what each slice in review needs. A console-only agent cannot approve at all: `delendai proposals review` passes neither evidence nor a commit, and approve requires evidence. And two product messages send adopters to scripts that exist only in this repository (`tools/scripts/review/proposal-review.script.ts`, `tools/scripts/lint/proposal-uniqueness.script.ts`).

## non-goals

- Host-specific instructions: every host reads the same server-provided procedure; no host file lists tools.
- Relaxing reviewer ≠ implementer, the evidence an approval carries, or the gates of review → done.
- A reviewer that edits code or submits on the implementer's behalf.

## Slices

- global_gate: e2e

### S1 — A checkpoint names the work ref it belongs to
- **Status**: review — shipped in #459 (merge 9b774a291)
- **Files**: `packages/core/src/lib/wip-engine/scope.ts`, `packages/core/src/lib/wip-engine/scope.constant.ts`, `packages/core/src/lib/wip-engine/checkpoint.ts`, `packages/core/src/lib/wip-engine/rebase.ts`, `packages/core/tests/src/lib/wip-engine/checkpoint.spec.ts`, `packages/core/tests/src/lib/wip-engine/rebase.spec.ts`
- **Gate**: type
- acceptance:
  - "Every checkpoint commit the WIP engine writes carries a trailer naming the ref it was written for, next to the scope and digest trailers."
  - "The trailer survives a squash merge that keeps commit bodies and a rebase, so the delivery stays attributable whatever the forge does."
- review-state: in_review
- review-implementer: claude-opus-5-5
### S2 — Attribution reads the project's declared ref shape, whatever the forge
- **Status**: review — shipped in #459 (merge 9b774a291)
- **DependsOn**: [S1]
- **Files**: `plugins/proposals/src/lib/services/work-ref-mention.ts`, `plugins/proposals/src/lib/services/review-attribution.ts`, `plugins/proposals/src/lib/contracts/interfaces/review-attribution.interface.ts`, `plugins/proposals/src/lib/tools/authoring.tool.ts`, `plugins/proposals/tests/src/lib/services/work-ref-mention.spec.ts`, `plugins/proposals/tests/src/lib/services/review-attribution.spec.ts`, `plugins/proposals/tests/src/lib/tools/review-repo.ts`, `plugins/proposals/tests/src/lib/tools/proposal-review-attribution.spec.ts`, `plugins/proposals/tests/src/lib/tools/proposal-review-close.spec.ts`
- **Gate**: e2e
- acceptance:
  - "The implementer is read, in order, from the work-ref trailer of the delivering commit, from any work or publication ref named in the message of the merge that brought it in (GitHub, GitLab, Bitbucket and plain git phrasings), and from a Co-Authored-By trailer."
  - "A ref is decoded with the project's own workRefTemplate, so the agent is found wherever the template puts it; a publication ref is mapped back to its work ref first."
  - "Squash, rebase and merge-commit histories each attribute in a test on a real repository, and so does a project with a non-default template."
- review-state: in_review
- review-implementer: claude-opus-5-5
### S3 — One call tells a reviewer what the review backlog needs
- **Status**: review — shipped in #459 (merge 9b774a291)
- **DependsOn**: [S2]
- **Files**: `plugins/proposals/src/lib/tools/review-queue.tool.ts`, `plugins/proposals/src/lib/services/review-queue.service.ts`, `plugins/proposals/src/lib/contracts/interfaces/review-queue.interface.ts`, `plugins/proposals/src/lib/services/review-attribution.ts`, `plugins/proposals/src/lib/contracts/interfaces/review-attribution.interface.ts`, `plugins/proposals/src/index.ts`, `plugins/proposals/src/lib/surface/disclosure.ts`, `plugins/proposals/tests/src/lib/tools/review-queue.tool.spec.ts`, `plugins/proposals/tests/src/lib/tools/review-repo.ts`, `packages/cli/src/commands/groups/proposals.ts`, `packages/cli/src/commands/groups/proposals.spec.ts`, `plugins/proposals/src/lib/services/delivery-history.service.ts`, `plugins/proposals/src/lib/contracts/constants/review-queue-schema.constant.ts`, `packages/cli/src/commands/registry.spec.ts`, `plugins/proposals/tests/src/lib/plugin.spec.ts`
- **Gate**: e2e
- acceptance:
  - "A read-only tool lists every proposal in review, oldest first, and for each slice: its review state, the implementer (recorded, derivable from Git, or the datum that is missing), the candidate delivering commits with where each came from, its gate and acceptance, and the exact next call."
  - "A proposal whose slices are all reviewed but which is still in review names the transition that closes it, or why it cannot close."
  - "The CLI exposes the queue, and `proposals review` accepts the commit and the evidence an approval needs, so a console-only agent can finish a review."
- review-state: in_review
- review-implementer: claude-opus-5-5
### S4 — Every host receives the same review procedure from the server
- **Status**: review — shipped in #459 (merge 9b774a291)
- **Files**: `plugins/proposals/src/lib/knowledge/proposal-workflow.ts`, `plugins/proposals/src/lib/skills/proposals-workflow-contribution.ts`, `plugins/proposals/src/lib/services/review-identity.ts`, `plugins/proposals/src/lib/tools/authoring.tool.ts`, `plugins/proposals/src/lib/tools/sync-proposals.tool.ts`, `plugins/proposals/tests/src/lib/knowledge/proposal-workflow-review.spec.ts`, `plugins/proposals/tests/src/lib/skills/proposals-workflow-contribution.spec.ts`, `plugins/proposals/tests/src/lib/tools/proposal-review-attribution.spec.ts`, `plugins/proposals/tests/src/lib/review-identity.spec.ts`
- **Gate**: type
- acceptance:
  - "The workflow knowledge states the reviewer's procedure: take the queue, verify each slice against its diff, gate and acceptance, then approve with evidence or request changes naming what, where, how to reproduce and what must hold; never edit code, never submit for the implementer, never close without a verdict."
  - "The overview's proposals snapshot counts the proposals awaiting review and points at the queue."
  - "No product message tells an adopter to run a script that exists only in this repository."
  - "A reviewer in another clone, machine, CI job or cloud agent can approve a round the document records, although the local submit journal is absent there; self-approval is still refused."
- review-state: in_review
- review-implementer: claude-opus-5-5
### S5 — A delivery nobody signed is reviewed as unrecorded
- **Status**: review — shipped in #459 (merge 9b774a291)
- **Files**: `plugins/proposals/src/lib/contracts/constants/review-attribution.constant.ts`, `plugins/proposals/src/lib/contracts/interfaces/review-attribution.interface.ts`, `plugins/proposals/src/lib/services/review-attribution.ts`, `plugins/proposals/src/lib/services/review-queue.service.ts`, `plugins/proposals/src/lib/contracts/interfaces/review-queue.interface.ts`, `plugins/proposals/src/lib/contracts/constants/review-queue-schema.constant.ts`, `plugins/proposals/src/lib/tools/authoring.tool.ts`, `plugins/proposals/tests/src/lib/services/review-attribution.spec.ts`, `plugins/proposals/tests/src/lib/tools/proposal-review-attribution.spec.ts`, `plugins/proposals/tests/src/lib/tools/review-queue.tool.spec.ts`, `plugins/proposals/tests/src/lib/tools/review-queue-candidates.spec.ts`, `plugins/proposals/tests/src/lib/tools/proposal-transition.tool.spec.ts`
- **Gate**: e2e
- acceptance:
  - "When a commit belongs to the slice but nothing in Git names who delivered it, the round opens under the reserved implementer `unrecorded`, the slice records that independence could not be verified, and the review goes ahead (maintainer decision, 2026-09-25)."
  - "A candidate that names its author is preferred over an unsigned one; no reviewer may review under the reserved name."
  - "A change request needs no delivering commit, so work that was never delivered can be sent back; an approval still needs one."
  - "The review queue lists unsigned deliveries as needs-verdict with implementerSource `unrecorded`."
- review-state: in_review
- review-implementer: claude-opus-5-5
## acceptance

- Every checkpoint commit the WIP engine writes carries a trailer naming the ref it was written for, next to the scope and digest trailers.
- The trailer survives a squash merge that keeps commit bodies and a rebase, so the delivery stays attributable whatever the forge does.
- The implementer is read, in order, from the work-ref trailer of the delivering commit, from any work or publication ref named in the message of the merge that brought it in (GitHub, GitLab, Bitbucket and plain git phrasings), and from a Co-Authored-By trailer.
- A ref is decoded with the project's own workRefTemplate, so the agent is found wherever the template puts it; a publication ref is mapped back to its work ref first.
- Squash, rebase and merge-commit histories each attribute in a test on a real repository, and so does a project with a non-default template.
- A read-only tool lists every proposal in review, oldest first, and for each slice: its review state, the implementer (recorded, derivable from Git, or the datum that is missing), the candidate delivering commits with where each came from, its gate and acceptance, and the exact next call.
- A proposal whose slices are all reviewed but which is still in review names the transition that closes it, or why it cannot close.
- The CLI exposes the queue, and `proposals review` accepts the commit and the evidence an approval needs, so a console-only agent can finish a review.
- The workflow knowledge states the reviewer's procedure: take the queue, verify each slice against its diff, gate and acceptance, then approve with evidence or request changes naming what, where, how to reproduce and what must hold; never edit code, never submit for the implementer, never close without a verdict.
- The overview's proposals snapshot counts the proposals awaiting review and points at the queue.
- No product message tells an adopter to run a script that exists only in this repository.
