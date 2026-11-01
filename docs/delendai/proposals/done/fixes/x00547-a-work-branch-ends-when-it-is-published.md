---
id: x00547
title: "A work branch ends when it is published"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-17
shipped-in:
    - d634b428e0de5dc96f97b1035959e0fc348d3966
    - 88ea0d11ccf82cca145a8fedd9e138fd51e8ad20
tags:
    - git
    - workflow
    - agents
    - gates
last-transition-id: b135a1dd-e497-410f-b07e-2f39572104cd
last-correlation-id: b135a1dd-e497-410f-b07e-2f39572104cd
last-transition-from: review
---

# x00547 — A work branch ends when it is published

## goal

When an agent finishes a work branch
(`delendai/wip/<model>/<proposal>-<slice>-g<n>-<topic>`) and opens its pull
request, the work branch is deleted and only the publication branch
(`delendai/pr/...`) remains. The ref guard fails any published work branch
that is still there, and one command does the whole handoff.

## why

Measured after x00546 merged (#259, #260, #262):

- Nothing deleted a work branch once it was published. Every publication
  left two remote branches with the same content, and a graph client
  showed both as live work.
- `ref-lifecycle` counted a published work branch as `active`, which is
  green. Nothing noticed the leftovers, so removing them relied on an agent
  remembering to.
- `forge:publish` only knew how to publish the current `HEAD` under a
  `pr/` ref. Publishing from a work branch took manual pushes, a manual
  delete and manual pruning, and any one of those steps could be skipped.

## non-goals

- **No deletion of unpublished work.** A work branch whose tip is not in
  the integration branch or in a publication ref stays `active`.
- **No forced push or forced fetch** anywhere on the publication path.
- **No raised baseline or budget.**

## slices

### S1 — A published work branch is reapable and the guard fails on it

- **Status**: done
  contains the work. A work ref that has one is assigned the
  `work-published` role, which counts as both `reapable` and
  `needsAttention`. The guard computes `publishedIn` by comparing the tip
  against the integration branch and every publication ref (`behind` or
  `identical`), and `--reap` deletes those refs and reports what it
  deleted. Live-verified on GitHub: a probe work branch turned the guard
  red, `--reap` deleted it, and the guard went back to green.
- **Files**: [`packages/core/src/lib/ref-lifecycle/reconcile.interface.ts`, `packages/core/src/lib/ref-lifecycle/reconcile.service.ts`, `packages/core/tests/src/lib/ref-lifecycle/work-namespace.spec.ts`, `tools/scripts/lint/ref-lifecycle-guard.script.ts`, `tools/scripts/lint/ref-lifecycle-guard.script.spec.ts`]
- **Gate**: `npx vitest run --project core packages/core/tests/src/lib/ref-lifecycle/ && npx vitest run --project tools tools/scripts/lint/ref-lifecycle-guard.script.spec.ts`
- review-state: done
- review-implementer: unrecorded
- review-reviewer: qwen-3.8-max
- review-log: approved by qwen-3.8-max — Implementer unrecorded: independence cannot be verified; reviewed identically to a recorded delivery. Read the full diff of d634b428e (11 files, all within the declared file lists of S1-S3 plus the proposal doc and bootstrap). Verified in the current tree: (1) IObservedRef.publishedIn exists (reconcile.interface.ts:27) naming the ref that already contains the work; (2) reconcile.service.ts assigns role 'work-published' (line 126) and counts it as both reapable (line 203) and needsAttention (line 212); (3) ref-lifecycle-guard.script.ts compares the tip against the integration branch and every publication ref, supports --reap (line 48) which deletes and reports; (4) work-namespace.spec.ts (59 new lines in the commit) + guard spec pass. Slice gate run verbatim: npx vitest run --project core packages/core/tests/src/lib/ref-lifecycle/ = 22/22 exit 0 (current tree also includes the x00546 extension). Empirical corroboration from this session's own workflow: my publication ref delendai/pr/qwen-3.8-max/... persisted while the wip ref was deleted, exactly the role split this slice implements. Non-goals respected: an unpublished work ref stays active (spec-covered); nothing in this diff force-pushes.
- review-attribution: unrecorded — nothing in Git names who delivered d634b428e0de5dc96f97b1035959e0fc348d3966: no work ref of this project in its message or in the merge that brought it into develop, and no Co-Authored-By trailer; independence could not be verified, opened by qwen-3.8-max
### S2 — Publishing from a work branch removes it

- **Status**: done
  refuses a branch outside the work namespace, an unknown branch, a remote
  copy that is ahead of the local one, and a publication it cannot verify.
  Otherwise it proves the tip, pushes that exact object without force,
  checks that the forge reports the same SHA, and only then deletes the
  remote work branch, prunes it, removes its clean worktree and the local
  branch. With `--open-pr` it also opens the pull request. The decision
  logic is a pure planner covered by specs, and a text spec pins the order
  prove → push → verify → delete.
- **Files**: [`tools/scripts/forge/publish-candidate.interface.ts`, `tools/scripts/forge/publish-candidate.script.ts`, `tools/scripts/forge/publish-candidate.script.spec.ts`]
- **Gate**: `npx vitest run --project tools tools/scripts/forge/publish-candidate.script.spec.ts`
- review-state: done
- review-implementer: unrecorded
- review-reviewer: qwen-3.8-max
- review-log: approved by qwen-3.8-max — Implementer unrecorded: independence cannot be verified; reviewed identically to a recorded delivery. Read the full diff of d634b428e (+322 lines in publish-candidate.script.ts). Verified in the current tree: (1) publish-candidate.interface.ts declares the refusal reasons — branch outside the work namespace, unknown branch, remote copy ahead of local, unverifiable publication (interface line 40 and companions); (2) the script proves the tip, pushes that exact object WITHOUT force, verifies the forge reports the same SHA, and only then deletes the remote work branch, prunes, removes the clean worktree and the local branch; --open-pr opens the PR; (3) the decision logic is a pure planner and a text spec pins the order prove → push → verify → delete. Slice gate run verbatim: npx vitest run --project tools tools/scripts/forge/publish-candidate.script.spec.ts (+ guard + cleanup specs together) = 70/70 exit 0. Empirical proof from this reviewer's own workflow yesterday: delendai work publish → push, 'prove-publication ok: origin reports it at 44568d912', then remove-work-ref local+remote — the exact sequence this slice implements, executed for real. Non-goals respected: no forced push on the publication path; no baseline raised. Acceptance point 2 (the proposal's own branch published with forge:publish --from-work-branch, only pr/ remaining) is asserted in the proposal notes and consistent with the remote refs observed today.
- review-attribution: unrecorded — nothing in Git names who delivered d634b428e0de5dc96f97b1035959e0fc348d3966: no work ref of this project in its message or in the merge that brought it into develop, and no Co-Authored-By trailer; independence could not be verified, opened by qwen-3.8-max
### S3 — A partial failure never leaves the handoff half done

- **Status**: done
  of git calls, and one that threw stopped the process: publishing
  x00548 S3 left the publication ref and an already-deleted remote work
  branch, while the local worktree, the local branch and the pull request
  were never reached and nothing said so. Each removal is now a step that
  runs regardless of the others; a step that threw is checked against git
  (the remote branch is gone, the worktree is no longer listed, the branch
  no longer resolves) before it is called a failure, since a delete can
  succeed on the remote and still exit non-zero. What really remains is
  printed with the command that finishes it, the pull request is still
  opened, and the exit code is non-zero while anything is left.
- **Files**: [`tools/scripts/forge/publish-cleanup.ts`, `tools/scripts/forge/publish-cleanup.spec.ts`, `tools/scripts/forge/publish-candidate.interface.ts`, `tools/scripts/forge/publish-candidate.script.ts`]
- **Gate**: `npx vitest run --project tools tools/scripts/forge/publish-cleanup.spec.ts tools/scripts/forge/publish-candidate.script.spec.ts`
- review-state: done
- review-implementer: unrecorded
- review-reviewer: qwen-3.8-max
- review-log: approved by qwen-3.8-max — Implementer unrecorded: independence cannot be verified; reviewed identically to a recorded delivery. The queue named d634b428e (S1+S2); git log traces S3 to 88ea0d11c, whose full diff I read. Verified in the current tree: (1) tools/scripts/forge/publish-cleanup.ts implements ICleanupStep with 'Run every step, whatever the earlier ones did' (line 21) — each removal (remote branch, worktree, local branch) is an independent step; (2) a step that threw is re-checked against git via step.isDone() before being called a failure (line 35), covering the case where a delete succeeds on the remote yet exits non-zero; (3) what remains is printed with step.remedy — the command that finishes it — and the exit code is non-zero while anything is left; the PR is still opened; (4) publish-cleanup.spec.ts (+95 lines in the commit) pins each of these paths, publish-candidate.interface.ts declares +26 lines of contracts, all within the declared files. Slice gate run verbatim: npx vitest run --project tools publish-cleanup.spec.ts publish-candidate.script.spec.ts = 51/51 exit 0. Non-goals respected: no forced push or fetch, no baseline raised.
- review-attribution: unrecorded — nothing in Git names who delivered 88ea0d11ccf82cca145a8fedd9e138fd51e8ad20: no work ref of this project in its message or in the merge that brought it into develop, and no Co-Authored-By trailer; independence could not be verified, opened by qwen-3.8-max
## acceptance

- `lint:ref-lifecycle` exits 1 while a work branch whose content is in
  develop or in a `pr/` ref still exists, and exits 0 after `--reap`.
- This proposal's own branch is published with
  `forge:publish --from-work-branch`, and afterwards only its `pr/` branch
  exists on the remote.
- The core and tools zones pass, and so do the lint-presets chain,
  `lint:architecture` and `format:all:check`, with no raised baseline.

## notes

A work branch that is merely behind develop is not published: the guard
checks whether its tip is contained in a container, and a branch with
unmerged commits of its own is never contained.
