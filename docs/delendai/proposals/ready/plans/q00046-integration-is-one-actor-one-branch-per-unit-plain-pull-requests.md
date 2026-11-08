---
id: q00046
title: "Integration is one actor, one branch per unit, plain pull requests"
kind: plan
status: ready
type: proposal
track: general
date: 2026-11-08
---

# q00046 — Integration is one actor, one branch per unit, plain pull requests

## goal

Integration has one actor, every unit has one branch and one plain pull request, and the product shows what is under test, what waits and why, and what landed.

## why

Measured on 2026-11-08: the integration code (tools/scripts/forge and tools/scripts/git) is about 18,800 lines in 61 files. 117 of develop's 210 commits that day (56%) were bookkeeping: proposal transitions, chore(wip), regenerations and internal merges. 9 integration failures were found only in production that day: the forge ruleset, the pre-push guard, an empty generated catalog, derived-file drift, the commit-branch lint, the refresher disagreeing with the queue, a ref loop between the publisher and ref maintenance, a proposal duplicated across folders, and claim leaving old PRs open. GitHub's native merge queue is unavailable for user-owned repositories. Failure patterns: several actors decide one fact with separate logic; the machinery blocks its own repair; nothing is rehearsed; intermediate state is opaque to people; there are too many pieces per unit (two refs, stacked PRs, claim opening new PRs, transition commits); tests are nondeterministic or slow. Target, every piece with one owner: (1) One unit = one branch = one PR, opened from the work branch at delivery; no separate publication ref, no continuous checkout publishing, no ref maintenance re-pushing; a large proposal uses sequential PRs, not stacked ones. (2) One integrator: the queue workflow in CI decides, brings forward, batches and lands; no owner-machine refresher and no local hydration; each decision lives in one function and a lint refuses duplicates of the known decisions (allowed namespaces, riders, culprits, landed). (3) Plain PRs: a lone PR lands itself; several ready PRs go in ONE batch PR (<ns>/queue/batch-a+b); a red batch attributes its culprit from the failing jobs and the members' footprints, drops it with a label, and re-batches the rest; forge-native trains or queues are used through the forge adapter where they exist (GitLab merge trains, GitHub org merge queue), the batch PR being the default. (4) An urgent lane for the machinery itself: a green PR that only touches integration machinery lands on its own checks, ahead of any batch. (5) Integration changes are rehearsed before they ship (i00005). (6) Checks are sectioned per PR, full only at develop to main, with deterministic tests and CI-calibrated budgets (c00537, v00155, q00045). (7) Commits mean something: a proposal transition rides in the slice commit that causes it, regeneration rides in the batch commit; bookkeeping under 10% of commits. (8) Everything is readable and agnostic: names say what they are; work status and the extension show what is under test, what waits and why, and what landed; forge, CI and host are reached through adapters.

## non-goals

- Do not change code in this proposal; each later slice becomes its own proposal when started.
- Do not depend on a forge feature a project may lack; the batch PR is the default everywhere.

## slices

- global_gate: none

### S1 — Land the work in flight
- **Status**: pending
- **Files**: `tools/scripts/forge/keep-the-queue-moving.script.ts`
- **Gate**: none
- acceptance:
  - "The open batch PRs, c00537 S7, i00005, x01054 and the lock-race fix are merged or retired with a reason"
  - "develop is green on its certifying run after they land"

### S2 — One integrator
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `tools/scripts/forge/advance-queue.script.ts`
- **Gate**: none
- acceptance:
  - "Only the queue workflow in CI decides, brings forward, batches and lands; no owner-machine refresher or local hydration remains"
  - "Allowed namespaces, riders, culprits and landed are each decided by one function, and a lint refuses a second implementation"
  - "A lone PR lands itself, several ready PRs go in one batch PR, a red batch names its culprit from failing jobs and footprints, drops it with a label and re-batches the rest"
  - "A green PR touching only integration machinery lands on its own checks ahead of any batch"
  - "Forge-native trains or queues are used through the forge adapter where they exist"

### S3 — One branch per unit, with its migration
- **Status**: pending
- **DependsOn**: [S2]
- **Files**: `tools/scripts/forge/publish-candidate.script.ts`
- **Gate**: none
- acceptance:
  - "A unit has one branch and one PR, opened from the work branch at delivery; no publication ref, continuous checkout publishing or ref-maintenance re-push exists"
  - "A large proposal lands as sequential PRs, never stacked, and claim opens no new PRs"
  - "Units and refs in the old layout are migrated by a command shipped in the same change"
  - "work status shows what is under test, what waits and why, and what landed"

### S4 — Transition commits folded
- **Status**: pending
- **DependsOn**: [S3]
- **Files**: `tools/scripts/forge/queue-acceptance.ts`
- **Gate**: none
- acceptance:
  - "A proposal transition rides in the slice commit that causes it and regeneration rides in the batch commit"
  - "Bookkeeping is under 10% of develop's commits over a full week"

### S5 — Weekly KPIs
- **Status**: pending
- **DependsOn**: [S4]
- **Files**: `tools/scripts/ci/pr-ci-cost.script.ts`
- **Gate**: none
- acceptance:
  - "pr-ci-cost reports weekly: small-PR open to merge median under 15 minutes, 0 human merges, bookkeeping under 10% of commits, 0 duplicated decisions"
  - "A KPI over its threshold is shown by name with the number, not hidden"

## acceptance

- The open batch PRs, c00537 S7, i00005, x01054 and the lock-race fix are merged or retired with a reason
- develop is green on its certifying run after they land
- Only the queue workflow in CI decides, brings forward, batches and lands; no owner-machine refresher or local hydration remains
- Allowed namespaces, riders, culprits and landed are each decided by one function, and a lint refuses a second implementation
- A lone PR lands itself, several ready PRs go in one batch PR, a red batch names its culprit from failing jobs and footprints, drops it with a label and re-batches the rest
- A green PR touching only integration machinery lands on its own checks ahead of any batch
- Forge-native trains or queues are used through the forge adapter where they exist
- A unit has one branch and one PR, opened from the work branch at delivery; no publication ref, continuous checkout publishing or ref-maintenance re-push exists
- A large proposal lands as sequential PRs, never stacked, and claim opens no new PRs
- Units and refs in the old layout are migrated by a command shipped in the same change
- work status shows what is under test, what waits and why, and what landed
- A proposal transition rides in the slice commit that causes it and regeneration rides in the batch commit
- Bookkeeping is under 10% of develop's commits over a full week
- pr-ci-cost reports weekly: small-PR open to merge median under 15 minutes, 0 human merges, bookkeeping under 10% of commits, 0 duplicated decisions
- A KPI over its threshold is shown by name with the number, not hidden
