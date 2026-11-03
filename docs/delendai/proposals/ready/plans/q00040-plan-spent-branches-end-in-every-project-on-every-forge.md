---
id: q00040
title: "Plan: spent branches end in every project, on every forge"
kind: plan
status: ready
type: proposal
track: a00095-consistency
date: 2026-11-03
---

# q00040 — Plan: spent branches end in every project, on every forge

## goal

In any project that uses delendai, on any forge, a branch whose work landed or was given up ends by itself: its publication head, its work ref and its worktree go, its tip is kept, and nobody has to tell an agent to clean up.

## why

The owner reported on 2026-11-03 that in delendai's own repository branches end once develop takes them in. In the projects that use delendai they stay behind, inconsistent, or never reach develop, and agents have to be told to repair them. That makes delendai look broken where it matters most. A read-only survey that day found:

- **games/pcf-mods/6** (GitHub, develop and main):
  - The head `delendai/pr/.../new-all-g1/work-refs-report` of PR #19, closed unmerged, is still on the remote and locally. Its replacement, #20, merged.
  - `delendai/wip/minimax-m3.1-flash-reviewer/review/batch-all-g2/verdicts` is unfinished and not in develop; nobody adopted or retired it.
  - `review/i00002-all-g1` is contained in develop and still exists in both copies.
  - Locally there are 5 `refs/delendai/stranded/unattributed/*` refs.
- **games/aoe2-mods** (GitHub, merge profile, develop and master): two local `wip/<agent>/...` branches from delendai's old namespace are fully in develop, and nothing sees them.
- **Beateam/logistics-app** (self-hosted GitLab): `gh` cannot reach it, so any path built on the GitHub CLI does nothing there.

The cause is that what ends a branch here is not part of the product:

- `.github/workflows/keep-the-queue-moving.yml` and `lint:ref-lifecycle --reap` exist only in delendai's own repository.
- The repository's delete-the-branch-on-merge setting is also only here.
- `init` installs hooks, the config and forge plugins, but no reaper (`packages/cli/src/lib/init/init-development-setup.service.ts`).
- The host server's startup only prunes, locally, refs the remote already deleted (`phases/fetch-refs.ts`).
- `work reap` reaps worktrees and local branches, and only when someone runs it.

## non-goals

- Touching branches outside delendai's namespaces (a person's `fix/*`, `feature/*`): they are reported at most, never renamed or deleted.
- Deleting work the integration branch lacks: `recovery.neverDiscardUnmergedWork` stays absolute. A spent ref goes only once its tip is kept under `refs/delendai/retired`.
- Installing a merge queue in consumer projects: how a project lands work stays its own (pull request, merge or direct, f00801).

## slices

- global_gate: none

### S1 — The product reaps what landed
- **Status**: pending
- **Files**: `packages/core/src/lib/startup-reconciler/phases/reap-leases.ts`
- **Gate**: type
- acceptance:
  - "The server that holds the maintenance lease, in any project, deletes the remote publication head of a pull request that merged or closed, and every work ref whose tip the integration branch contains and no live unit holds. It keeps each tip under refs/delendai/retired first; a ref holding work the integration branch lacks is never deleted."

### S2 — Judged from git, not from one forge
- **Status**: pending
- **Files**: `packages/core/src/lib/startup-reconciler/phases/merged-publications.helper.ts`
- **Gate**: type
- acceptance:
  - "Whether a publication landed is judged from git: ancestry, and the merge commit that names it. The forge plugin only adds pull requests closed unmerged, where it can see them, so a GitLab project or one with no forge CLI is reaped the same way."

### S3 — init sets the forge's own cleanup
- **Status**: pending
- **Files**: `packages/cli/src/lib/init/init-development-setup.service.ts`
- **Gate**: type
- acceptance:
  - "init offers the forge's delete-the-branch-on-merge setting (GitHub delete_branch_on_merge, GitLab remove_source_branch), turns it on with consent, and says so when it cannot. The setting removes only publication heads (delendai/pr/...); work refs (delendai/wip/...) live until their proposal closes, which is why `integration.deleteMergedWorkRef` is false in the pull-request profiles (profiles.ts). Whoever closes a proposal ends its work ref, here and in every project."

### S4 — Old and stranded refs are brought in
- **Status**: pending
- **Files**: `packages/core/src/lib/startup-reconciler/phases/rebuild-work-units.ts`
- **Gate**: type
- acceptance:
  - "At startup, refs in delendai's old namespace (wip/<agent>/...) are renamed into the current one, or retired with their tip when the integration branch holds them. stranded/unattributed refs are reported with the one command that settles each. Branches outside delendai's namespaces are never touched."

### S5 — An abandoned unit ends
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/unit-reaper.service.ts`
- **Gate**: type
- acceptance:
  - "A unit past the recovery window that nobody adopts, reviewer units included, is retired with its tip kept and named in the next status, so no unit stays half-done for good."

### S6 — Proved in a foreign project
- **Status**: pending
- **Files**: `docs/delendai/proposals/ready/plans/q00040-plan-spent-branches-end-in-every-project-on-every-forge.md`
- **Gate**: none
- acceptance:
  - "In a throwaway consumer project with a merged pull request, a closed one, an old-namespace ref and an abandoned unit, one maintenance pass leaves no spent ref and every tip under refs/delendai/retired. The run is recorded in this proposal's notes."

## acceptance

- The server that holds the maintenance lease, in any project, deletes the remote publication head of a pull request that merged or closed, and every work ref whose tip the integration branch contains and no live unit holds. It keeps each tip under refs/delendai/retired first; a ref holding work the integration branch lacks is never deleted.
- Whether a publication landed is judged from git: ancestry, and the merge commit that names it. The forge plugin only adds pull requests closed unmerged, where it can see them, so a GitLab project or one with no forge CLI is reaped the same way.
- init offers the forge's delete-the-branch-on-merge setting (GitHub delete_branch_on_merge, GitLab remove_source_branch), turns it on with consent, and says so when it cannot. The setting removes only publication heads (delendai/pr/...); work refs (delendai/wip/...) live until their proposal closes, which is why `integration.deleteMergedWorkRef` is false in the pull-request profiles (profiles.ts). Whoever closes a proposal ends its work ref, here and in every project.
- At startup, refs in delendai's old namespace (wip/<agent>/...) are renamed into the current one, or retired with their tip when the integration branch holds them. stranded/unattributed refs are reported with the one command that settles each. Branches outside delendai's namespaces are never touched.
- A unit past the recovery window that nobody adopts, reviewer units included, is retired with its tip kept and named in the next status, so no unit stays half-done for good.
- In a throwaway consumer project with a merged pull request, a closed one, an old-namespace ref and an abandoned unit, one maintenance pass leaves no spent ref and every tip under refs/delendai/retired. The run is recorded in this proposal's notes.
