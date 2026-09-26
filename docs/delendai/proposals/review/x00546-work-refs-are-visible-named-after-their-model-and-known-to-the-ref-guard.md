---
id: x00546
title: "Work refs are visible, named after their model, and known to the ref guard"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-17
shipped-in:
    - 35db9ff33bfdcd27f463dd295ec20c32273b74fe
    - ee59e78faf06e3f7ab461873c2e2f4b89970be82
    - 4e19d1bc4669a03798d169652648238f5a82003c
    - 7715725d99cb1704946e33c524aa3836639a9ff4
tags:
    - git
    - workflow
    - agents
    - gates
---

# x00546 — Work refs are visible, named after their model, and known to the ref guard

## goal

An agent working under the shared-checkout model keeps its work in a
visible branch that any Git client shows, named after the exact model and
what the work is (`delendai/wip/claude-opus-5/x00546-S1-g1-configurable-ref-namespace`),
and that branch never blocks a pull request. This must hold from any
agent — Claude, Codex, Copilot or a terminal.

## why

Measured on develop at `ac276f8ef`:

- `ref-lifecycle` classified refs by `foreignRefPrefixes` and
  `publicationRefPrefix` and never consulted `workRefPrefix`. A visible
  work branch fell through to `unmanaged`, which exits 1. That job feeds
  `delendai-validate`, the single required check, so one work branch
  blocked every pull request into develop (seen on #258).
- Even with the check, the prefix could not match: it is declared
  fully qualified (`heads/delendai/wip/`) while the forge reports short
  names (`delendai/wip/...`).
- The default work-ref template was hidden (`refs/wip/*`), which no Git
  client lists as a branch.
- `commit-policy` filled `${agent}` with `hostIdentity.host ?? hostname()`,
  so refs were named after the machine (`DESKTOP-9CTQRS7`) although the
  boot-resolved identity already carried the model.
- The namespace was hardcoded to `delendai/`.

## non-goals

- **No raised baseline or budget.** The public surface stays at 1076.
- **No deletion of another agent's unmerged work** while classifying refs.

## slices

### S1 — The ref guard knows the configurable work namespace

- **Status**: done
  `workRefPrefix`, compared after stripping `refs/`/`heads/` from both
  sides; work refs are reported in an `active` bucket and printed by the
  guard. `namespacePrefix` (default empty → `wip/`, `pr/`) composes both
  prefixes; this project sets `delendai`.
- **Files**: [`packages/core/src/lib/ref-lifecycle/reconcile.interface.ts`, `packages/core/src/lib/ref-lifecycle/reconcile.service.ts`, `packages/core/src/lib/contracts/interfaces/development-policy.interface.ts`, `packages/core/src/lib/development-policy/profiles.ts`, `packages/core/src/lib/development-policy/resolve.ts`, `packages/core/src/lib/development-policy/resolve.interface.ts`, `packages/core/src/lib/plugins/development-config-schema.constant.ts`, `packages/core/schema/delendai.config.schema.json`, `delendai.config.json`, `tools/scripts/lint/ref-lifecycle-guard.script.ts`, `packages/core/tests/src/lib/ref-lifecycle/work-namespace.spec.ts`, `packages/core/tests/src/lib/ref-lifecycle/reconcile.spec.ts`]
- **Gate**: `npx vitest run --project core packages/core/tests/src/lib/ref-lifecycle/ && bun run lint:ref-lifecycle`
- review-state: done
- review-implementer: unrecorded
- review-reviewer: qwen-3.8-max
- review-log: approved by qwen-3.8-max — Independence OK: implementer DESKTOP-9CTQRS7 (git host identity), reviewer qwen-3.8-max. Read the full diff of 35db9ff33. Verified: (1) reconcile.service.ts roleOf now returns a 'work' role for refs under workRefPrefix, comparing after stripping refs//heads/ qualification from both sides — the two stacked defects (never consulting workRefPrefix, and fully-qualified prefix vs short forge names) are both fixed; (2) namespacePrefix is configurable with an empty default composing both wip/ and pr/ prefixes so they cannot drift, delendai.config.json sets 'delendai' so this project's refs are unchanged; schema + development-policy interfaces + resolve.ts all declared files updated; (3) the guard reports work refs in an active bucket and prints them. Slice gate run verbatim: npx vitest run --project core packages/core/tests/src/lib/ref-lifecycle/ = 22/22 exit 0, and bun run lint:ref-lifecycle exits 0 reporting '2 ref(s); every one of them belongs to somebody'. The extra in-scope items the commit message declares (contracts routing restore, validateScopePaths move, writeFileAtomic, startup-reconciler policy-derived mystery ref) are consistent with the slice Files list. No out-of-scope changes found.
- review-attribution: unrecorded — nothing in Git names who delivered 35db9ff33bfdcd27f463dd295ec20c32273b74fe: no work ref of this project in its message or in the merge that brought it into develop, and no Co-Authored-By trailer; independence could not be verified, opened by qwen-3.8-max
### S2 — A work ref names its model and its purpose

- **Status**: done
  `heads/<ns>wip/${agent}/${proposal}-${slice}-g${generation}-${topic}`;
  `${agent}` resolves to the model, then host, then hostname; `topic`
  falls back to `work`. The topic is optional on read so refs written
  before this change still attribute.
- **Files**: [`packages/core/src/lib/wip-engine/ref-name.ts`, `packages/core/src/lib/wip-engine/ref-name.interface.ts`, `packages/core/src/lib/startup-reconciler/work-ref-identity.ts`, `packages/core/src/lib/startup-reconciler/work-ref-identity.interface.ts`, `plugins/commit-policy/src/index.ts`, `packages/core/tests/src/lib/startup-reconciler/work-ref-topic.spec.ts`, `packages/core/tests/src/lib/startup-reconciler/integration-evidence.spec.ts`]
- **Gate**: `npx vitest run --project core packages/core/tests/src/lib/startup-reconciler/`
- review-state: done
- review-implementer: DESKTOP-9CTQRS7
- review-reviewer: qwen-3.8-max
- review-log: approved by qwen-3.8-max — Independence OK: implementer DESKTOP-9CTQRS7 (git host identity), reviewer qwen-3.8-max. Read the full diff of ee59e78fa and its declared files in the current tree. Verified: (1) the work ref template is heads/<ns>wip/${agent}/${proposal}-${slice}-g${generation}-${topic} — ref-name.ts/ref-name.interface.ts carry it and the live tree confirms the shape (work status prints 'heads/delendai/wip/${agent}/${proposal}-${slice}-g${generation}/${topic}'); (2) ${agent} resolves model → host → hostname: commit-policy/src/index.ts consumes the boot-resolved identity's exact model first (e.g. my own refs read qwen-3.8-max, another agent's read claude-opus-5-5 — both visible in this checkout right now, empirical confirmation); (3) topic falls back to 'work' rather than 'unnamed' (work-ref.tool.ts); (4) the topic is OPTIONAL on read — work-ref-identity.ts still attributes every ref written before the change, which the startup-reconciler specs pin (the commit message records the counterfactual: making it required booted 11 legacy-ref machines to DEGRADED). Slice gate run verbatim: npx vitest run --project core packages/core/tests/src/lib/startup-reconciler/ = 89/89 exit 0 (includes work-ref-topic.spec.ts 6 new cases: round trip, hyphenated topics, legacy refs, prose sanitising; and integration-evidence.spec.ts). No out-of-scope changes.
- review-attribution: DESKTOP-9CTQRS7 from commit ee59e78faf06 names refs/heads/delendai/wip/DESKTOP-9CTQRS7/x00545-S0-g1 (ee59e78faf06e3f7ab461873c2e2f4b89970be82), opened by qwen-3.8-max
### S3 — Finish the in-flight work-ref tool it builds on

- **Status**: done
  plugin (configured remote, else an existing `origin`); the index guard
  hashes through git instead of reading `.git/index`; the 882-line tool is
  split by responsibility; `validateScopePaths` moves to the plugin
  subpath; the contracts routing a rehydrate undid is restored; and the
  shingle detector groups by block text, since a 32-bit hash collision
  was reported as cross-plugin copy-paste.
- **Files**: [`plugins/commit-policy/src/lib/tools/work-ref.tool.ts`, `plugins/commit-policy/src/lib/services/work-ref-repo.service.ts`, `plugins/commit-policy/src/lib/services/work-ref-checkpoint.service.ts`, `plugins/commit-policy/src/lib/services/work-ref-policy.service.ts`, `plugins/commit-policy/src/lib/contracts/interfaces/work-ref-tool.interface.ts`, `plugins/commit-policy/src/lib/contracts/constants/work-ref.constant.ts`, `plugins/commit-policy/src/lib/contracts/constants/durability-remote.constant.ts`, `plugins/commit-policy/src/lib/persistence/durability-remote.service.ts`, `plugins/commit-policy/src/lib/persistence/wip-persistence.ts`, `packages/core/src/lib/scan/shingle.ts`, `packages/core/tests/src/lib/scan/shingle-collision.spec.ts`]
- **Gate**: `npx vitest run plugins/commit-policy && bun run lint:architecture`
- review-state: done
- review-implementer: DESKTOP-9CTQRS7
- review-reviewer: qwen-3.8-max
- review-log: approved by qwen-3.8-max — Independence OK: implementer DESKTOP-9CTQRS7 (git host identity), reviewer qwen-3.8-max. Read the ee59e78fa diff and verified every declared S3 file exists in the current tree: work-ref.tool.ts split by responsibility into work-ref-repo.service.ts, work-ref-checkpoint.service.ts and work-ref-policy.service.ts with its contracts (work-ref-tool.interface.ts, work-ref.constant.ts); durability-remote.service.ts + durability-remote.constant.ts resolve the remote like the rest of the plugin (configured remote else existing origin); wip-persistence.ts hashes the index through git instead of reading .git/index; core shingle.ts groups by block text with shingle-collision.spec.ts pinning that a 32-bit hash collision is not cross-plugin copy-paste. Slice gate run verbatim: npx vitest run plugins/commit-policy = 668 passed / 1 skipped / 669 total, exit 0; bun run lint:architecture exit 0 on develop @ 2cbb07972. The 1 skipped test is pre-existing in the suite, not introduced by this slice (the whole commit-policy zone passes). No out-of-scope regressions observed; the work-ref tool exercised end-to-end this session (work status/enter/checkpoint/publish all functioned against this code).
- review-attribution: DESKTOP-9CTQRS7 from commit ee59e78faf06 names refs/heads/delendai/wip/DESKTOP-9CTQRS7/x00545-S0-g1 (ee59e78faf06e3f7ab461873c2e2f4b89970be82), opened by qwen-3.8-max
## acceptance

- `lint:ref-lifecycle` exits 0 with a visible work branch present and
  reports it.
- A ref written as
  `delendai/wip/claude-opus-5/x00546-S1-g1-configurable-ref-namespace`
  parses back to its model, proposal, slice, generation and topic.
- The core zone and the commit-policy suite pass; `lint:architecture` and
  `lint:solid` pass with no raised baseline.

## notes

The hidden `refs/wip/DESKTOP-9CTQRS7/*` refs are earlier generations of
the work this builds on. `f00549-S4-g1` among them carries a 360-line
`check-architecture.tool.ts` for f00549 S4 mixed with reversions of #257;
it is preserved, not deleted, and the S4 part should be rebased onto
develop rather than merged as it stands.

### Disposition of the recovered `gpt-5.6` work branches

The hidden `refs/wip/DESKTOP-9CTQRS7/*` refs held five pieces of work no
other ref contained. They were first made visible as
`delendai/wip/gpt-5.6/*`, then each was measured against develop at
`7033e2905` — per file, whether its patch was already present, portable,
or conflicting — and its content read against the model this proposal
ships. Four are discarded, one continues. SHAs are recorded so the
content stays identifiable after the refs are deleted.

- `x00545-META-g1` (`80e311ba213345e620be9649365a6421de994172`, 1 file,
  +154) — Codex's proposal "shared-checkout-pr must never move HEAD or
  teach agents to branch". **Discarded:** it designs work around hidden
  `refs/wip/*` outside `refs/heads`, which this proposal replaces with
  visible work branches. Dropping it also removes the id collision with
  the `x00545` already on develop.
- `x00545-S1-g1` (`9421185e4429e7837264b014ad9678cce08f57fc`, 5 files,
  +503/-75) — proposal publication without mutating the checkout.
  **Discarded:** develop's `publish-proposal` already never touches
  `symbolic-ref`, and the branch adds a new hidden carrier ref
  (`refs/wip/proposal-publication/<id>`).
- `x00545-S2-g1` (`d4f482ccf841e0eb9b00003c6e8146f970d576c1`, 3 files,
  +96/-152) — shared-checkout docs. **Discarded:** develop's docs no
  longer teach the hidden model, and this branch would reintroduce it
  ("dirty files visible in the shared checkout are edits", checkpoints on
  `refs/wip/*`).
- `x00545-S3-g1` (`d02f770ab5dc1b71703d85a18480b6bba438631a`, 6 files,
  +290/-128) — integration-branch guardrails. **Discarded after porting
  and measuring:** its specs pass, but its new `regressive-policy-wording`
  rule would flag documentation of visible work branches as regressive,
  its refusal points agents at "a non-head WIP ref", `lint:commit-branch`
  exits 1 and two `push-to-develop-discipline` e2e cases fail. Its one idea
  worth keeping — `commit-branch-discipline` reading the integration branch
  from the development policy rather than a hardcoded `develop` — has since
  been done on its own (`branches.integration` through `declaredBranches`,
  `develop` only when no policy can be read).
- `f00549-S4-g1` (`df1be0df5fbdbd58c8d06b6186c90cfe9fbe888a`, 4 files,
  +413/-2) — partial `conventions_check_architecture`. **Continues** on
  `delendai/wip/claude-opus-5/f00549-S4-g1-check-architecture`
  (byte-identical files); it is not mergeable yet, see f00549 S4.

### Committing on a work branch was refused by pre-commit

`commit-branch-discipline` allowed commits only on `develop` and
`release/*` when `agentWorktree` is false, and told the agent to
`git switch develop`. That refused every commit on a visible work branch
in its own worktree — the flow this proposal ships — and pointed agents
back at the integration branch. Commits made in a detached HEAD or by
cherry-pick never ran the hook, which is how it went unnoticed. The hook
now allows branches inside the policy's work and publication namespaces
(read through `declaredBranches`) and its remedy describes that flow.

