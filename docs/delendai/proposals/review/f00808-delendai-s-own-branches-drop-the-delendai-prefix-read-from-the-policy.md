---
id: f00808
title: "delendai's own branches drop the delendai/ prefix, read from the policy"
kind: feat
status: review
type: proposal
track: general
date: 2026-11-04
last-transition-id: 0f533c39-7298-4f81-a1f0-802461290ae8
last-correlation-id: 0f533c39-7298-4f81-a1f0-802461290ae8
last-transition-from: in-progress
last-transition-at: 2026-11-05T00:43:42.372Z
---

# f00808 — delendai's own branches drop the delendai/ prefix, read from the policy

## goal

In this repository new work refs are `wip/<agent>/...` and publications `pr/<agent>/...`; every consumer of the prefix reads it from the resolved development policy (`branches.namespacePrefix`, which already exists), recognises the old `delendai/` prefix until its last unit ends, and the old refs are renamed only by an explicit command that refuses while any of them carries an open pull request.

## why

The owner wants this repository, which is delendai itself, to stop prefixing its branches with `delendai/`: the prefix exists so that OTHER projects can tell delendai's branches apart from their own, and in delendai's own repository every branch is delendai's. `init` must keep `delendai/` as the default for every other project. Survey 2026-11-04: the setting is already there (`development.branches.namespacePrefix`, composed into workRefTemplate, workRefPrefix and publicationRefPrefix in packages/core/src/lib/development-policy/resolve.ts) and most of core reads it, but several consumers still spell `delendai/` or `refs/delendai/` literally (ci.yml lines 1497 and 1539, FORWARD_SYNC_REF_PREFIX, agent-claims lint, publish-proposal and create_proposal fallbacks, the proposal-id reservation and retired/claims hidden refs, `refs/${prefix}/retired/*` in two reapers), nothing recognises a FORMER prefix, so flipping the config today would orphan every live `delendai/` unit and split the id allocator. init keeps its current default, no prefix (adopt.ts writes only integration and release; profiles.ts defaults to empty): the owner dropped the slice that would have written `delendai`, so only this repository's config changes. The owner also wants branch names a person can read at a glance: `delendai/wip/gpt-5.3-codex/implement/batch-all-g1/work` says nothing to a person (`batch-all`, `-all`, `-g1`, `work`, `verdicts`). A past rename through the GitHub API closed all 7 open pull requests, so the migration never renames a ref with an open pull request.

## non-goals

- Changing init's default namespace (stays empty) or rewriting any existing project's config: adoption never overwrites a declared policy.
- Renaming refs automatically at startup or in a reaper: renaming is only the explicit command of S7.
- Using the forge's branch-rename API for anything.

## slices

- global_gate: type

### S1 — Former prefixes are part of the policy
- **Status**: review
- **Files**: `packages/core/src/lib/contracts/interfaces/development-policy.interface.ts`, `packages/core/src/lib/development-policy/resolve.ts`, `packages/core/src/lib/development-policy/resolve.interface.ts`, `packages/core/src/lib/plugins/development-config-schema.constant.ts`, `packages/core/schema/delendai.config.schema.json`, `packages/core/tests/src/lib/development-policy/resolve.spec.ts`, `packages/core/src/lib/development-policy/owned-ref-prefixes.ts`, `packages/core/tests/src/lib/development-policy/owned-ref-prefixes.spec.ts`
- **Gate**: type
- acceptance:
  - "No setting covers the transition today (checked: namespacePrefix, workRefTemplate, workRefPrefix, publicationRefPrefix, foreignRefPrefixes), so one is added: `development.branches.formerNamespacePrefixes` (default []), documented as transition-only."
  - "The resolved policy exposes, once, the owned work-ref and publication prefixes: the current ones composed from namespacePrefix, then the same shapes for each former prefix. Every later slice reads these lists and nothing else."
  - "Spec: `namespacePrefix: ""` resolves to `heads/wip/`, `pr/` and `refs/<x>`; `"delendai"` to `heads/delendai/wip/` and `delendai/pr/`; a former `delendai` beside an empty current yields both, current first."
- shipped-in: `a4f7f8b7875e`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S2 — Guards and ref identity recognise both prefixes
- **Status**: review
- **DependsOn**: [S1]
- **Files**: `packages/core/src/lib/development-policy/git-guard-namespaces.ts`, `packages/core/src/lib/startup-reconciler/work-ref-identity.ts`, `packages/core/src/lib/work-units/namespaced-ref.helper.ts`, `packages/core/tests/src/lib/work-units/namespaced-ref.helper.spec.ts`, `packages/core/tests/src/lib/development-policy/git-guard-namespaces.spec.ts`, `packages/core/src/lib/development-policy/owned-work-ref-parser.ts`, `packages/core/tests/src/lib/development-policy/owned-work-ref-parser.spec.ts`, `packages/core/src/lib/contracts/interfaces/owned-work-ref-shape.interface.ts`
- **Gate**: type
- acceptance:
  - "The ref guard accepts commits and pushes to an existing live unit or publication under a former prefix; every NEW unit and publication is named under the current prefix by `work enter` and `work publish` (the guard does not refuse a branch-create there, which re-entering an old unit needs)."
  - "Ref identity parses a unit under any owned prefix to the same agent/kind/proposal/slice/generation/topic, so `work enter` on an existing `delendai/wip/...` unit re-enters it (no second unit, as work-ref-migration.spec.ts already requires for old shapes)."
  - "namespacedRef keeps writing under the current namespace; a new `ownedRefRoots(policy, part)` returns the current root then each former one for readers."
  - "Spec: both prefixes recognised in the transition; a new unit is named under the current prefix."
- shipped-in: `3b62c17129fc`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S3 — Hidden refs and proposal tools stop spelling refs/delendai
- **Status**: review
- **DependsOn**: [S2]
- **Files**: `packages/core/src/lib/work-units/unit-reaper.service.ts`, `packages/core/src/lib/work-units/work-unit-generation.service.ts`, `packages/core/src/lib/work-units/stranded-edits.service.ts`, `packages/core/tests/src/lib/work-units/stranded-edits.service.spec.ts`, `plugins/proposals/src/lib/proposals/proposal-id-sources.ts`, `plugins/proposals/tests/src/lib/proposals/proposal-id-sources.spec.ts`, `plugins/proposals/src/lib/services/carried-work.service.ts`, `plugins/proposals/src/lib/contracts/constants/review-reservation.constant.ts`, `plugins/proposals/src/lib/tools/publish-proposal.ts`, `plugins/proposals/tests/src/lib/tools/publish-proposal.spec.ts`, `plugins/proposals/src/lib/tools/authoring/create-proposal.tool.ts`, `packages/core/src/lib/work-units/unit-refs-any-name.service.ts`, `packages/core/tests/src/lib/work-units/unit-refs-any-name.service.spec.ts`, `packages/core/tests/src/lib/work-units/work-unit-generation.service.spec.ts`
- **Gate**: type
- acceptance:
  - "`refs/${namespacePrefix}/retired/*` (unit-reaper, work-unit-generation) becomes namespacedRef, which is git-valid with an empty prefix."
  - "stranded-edits with an empty prefix scans only the owned roots, never every ref under refs/remotes/origin."
  - "Retired-tip, stranded and claim readers look under every owned root, so a tip kept under refs/delendai/retired stays found. The id and review reservations stay at one fixed hidden ref each (compare-and-swap on one ref; two namespaces would let two allocators take the same id), so an id is never issued twice."
  - "publish-proposal takes the publication prefix from the policy, falling back to the default policy's. create_proposal's no-policy fallback is left as it was."
- shipped-in: `71f95fea5be4`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S4 — Queue, publications and reapers take the prefix from the policy
- **Status**: review
- **DependsOn**: [S2]
- **Files**: `tools/scripts/forge/keep-the-queue-moving.script.ts`, `tools/scripts/forge/keep-the-queue-moving.script.spec.ts`, `tools/scripts/forge/candidate-disposition.ts`, `tools/scripts/forge/candidate-disposition.spec.ts`, `tools/scripts/forge/forward-sync-release.script.ts`, `tools/scripts/forge/forward-sync-release.script.spec.ts`, `tools/scripts/forge/close-unpublished-prs.script.ts`, `tools/scripts/git/maintain-ref-namespace.script.ts`, `tools/scripts/lint/ref-lifecycle-guard.script.ts`, `tools/scripts/lint/ref-lifecycle-guard.script.spec.ts`, `tools/scripts/lint/agent-claims.script.ts`, `tools/scripts/lint/closed-with-independent-approval.script.ts`, `packages/cli/src/lib/review/review-releases.service.ts`, `tools/scripts/forge/publication-prefixes.ts`, `tools/scripts/forge/publication-prefixes.spec.ts`, `packages/cli/src/lib/review/review-releases.service.spec.ts`
- **Gate**: type
- acceptance:
  - "The queue arms, and candidate-disposition disposes, publications under every owned publication prefix; FORWARD_SYNC_REF_PREFIX is derived from the current publicationRefPrefix."
  - "maintain-ref-namespace, ref-lifecycle --reap and agent-claims treat refs under a former prefix as delendai's (reaped or kept by the same rules), and refs outside every owned prefix as foreign."
  - "Spec per script: a fixture with one `delendai/pr/...` and one `pr/...` publication under `namespacePrefix: ""` + former `delendai` handles both."
- shipped-in: `04b0e0d3f4b6`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S5 — Forge rules and CI filters follow the policy
- **Status**: review
- **DependsOn**: [S1]
- **Files**: `tools/scripts/governance/forge-settings.lib.ts`, `tools/scripts/governance/forge-settings.lib.spec.ts`, `.github/branch-protection.yml`, `.github/branch-protection.ts`, `.github/workflows/ci.yml`, `lefthook.yml`, `tools/scripts/lint/branch-protection-guard.script.ts`, `tools/scripts/lint/ci-publication-filters.script.ts`, `tools/scripts/lint/ci-publication-filters.script.spec.ts`
- **Gate**: type
- acceptance:
  - "Rendered rulesets and branch protection cover the work and publication refs of every owned prefix."
  - "ci.yml's two `delendai/pr/` head filters (publication dispatch and the queue job) accept each owned publication prefix; YAML cannot read the policy, so branch-protection-guard fails when the prefixes ci.yml names differ from the resolved policy's owned publication prefixes."
- shipped-in: `b193017aeeb9`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S7 — An explicit command renames the remaining old refs, never one with an open pull request
- **Status**: review
- **DependsOn**: [S3, S4]
- **Files**: `packages/core/src/lib/work-units/namespace-rename.service.ts`, `packages/core/tests/src/lib/work-units/namespace-rename.service.spec.ts`, `packages/cli/src/commands/work.command.ts`, `packages/cli/src/commands/work-ref-migration.spec.ts`, `packages/core/src/lib/work-units/work-unit-rename-namespace.service.ts`, `packages/core/tests/src/lib/work-units/work-unit-rename-namespace.service.spec.ts`, `packages/core/src/lib/contracts/interfaces/namespace-rename.interface.ts`
- **Gate**: type
- acceptance:
  - "`delendai work rename-namespace` is a dry run unless `--apply`; it has a help summary."
  - "It refuses as a whole while any open pull request has its head under a former prefix, and when the forge cannot be read; it checks each ref again just before acting."
  - "Each ref is renamed by pushing the new name at the same tip, verifying it, keeping the old tip under the retired root, then deleting the old name. The forge rename API is never called."
  - "When no ref is left under a former prefix it says so and names the config line to remove."
  - "Spec: no rename of a ref with an open pull request; tips identical before and after."
- shipped-in: `e730fb5ff9a3`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S9 — Branch names a person can read at a glance
- **Status**: review
- **DependsOn**: [S2]
- **Files**: `packages/core/src/lib/development-policy/profiles.constant.ts`, `packages/core/src/lib/development-policy/work-ref-placeholders.ts`, `packages/core/src/lib/wip-engine/ref-name.ts`, `packages/core/src/lib/wip-engine/scope.ts`, `packages/core/src/lib/development-policy/work-ref-scope.ts`, `packages/core/src/lib/contracts/interfaces/work-ref-scope.interface.ts`, `packages/core/src/lib/contracts/constants/work-ref-scope.constant.ts`, `packages/core/tests/src/lib/development-policy/work-ref-scope.spec.ts`
- **Gate**: type
- acceptance:
  - "The readable template, chosen with `workRefTemplate` (publications use the same shape after `publicationRefPrefix`), is `{wip|pr}/{action}/{agent}/{scope}/{topic}`, the owner's scheme (`READABLE_WORK_REF_SHAPE`). It is not yet the library default: 74 specs and the generation bookkeeping assume the current shape. With this repository's empty prefix the names start directly with `wip/` or `pr/`: `wip/implement/claude-opus-5-5/x01003/shared-checkout-stays-clean`, `pr/implement/claude-opus-5-5/x01003-S2/work-ref-refuses-shared-checkout`, `wip/review/gpt-5.3-codex/x01004+x01016/verdicts`."
  - "action is implement, review, create or fix. scope is a proposal (`x01003`), one slice (`x01003-S2`), a range (`x01003-S1-S3`), a set (`x01003-S1+S4`) or several proposals (`x01004+x01016`), with `-G{n}` (uppercase) only from the second generation on (`x01003-G2`). Only `-` and `+` join parts: `[ ]`, `~`, `..` and spaces are not valid in git refs. topic is a short human summary of what the branch integrates; on a publication, of what that pull request ships."
  - "Spec: the scope grammar is parsed and rendered both ways for proposal, slice, range, set, multi-proposal and generation, and every rendered name passes `git check-ref-format`."
  - "Both forms are recognised in the transition: every owned-namespace parser reads the readable shape and the current one, under the current and the former namespace. Reading the identity from the `Delendai-Wip-Ref` trailer first is left to a follow-up."
  - "A unit under the earlier shape or namespace still enters, checkpoints and publishes under its own name. No ref with an open pull request is ever renamed."
- shipped-in: `1b4ca3288929`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S8 — This repository switches, and q00040 learns the current namespace
- **Status**: review
- **DependsOn**: [S2, S3, S4, S5, S9]
- **Files**: `delendai.config.json`, `docs/delendai/proposals/ready/plans/q00040-plan-spent-branches-end-in-every-project-on-every-forge.md`
- **Gate**: none
- acceptance:
  - "delendai.config.json sets `namespacePrefix: ""` and `formerNamespacePrefixes: ["delendai"]`, and ci.yml's publication filters name both prefixes; only this repository's config changes, and no existing ref is renamed. The readable template of S9 is not switched on here yet: generation bookkeeping (`endedGenerations`) still reads `-g<n>` from names."
  - "After it lands a new unit here enters `wip/<agent>/...` and publishes `pr/<agent>/...`, while every existing `delendai/...` unit keeps entering, checkpointing and publishing under its own name until it ends."
  - "q00040 S4's 'old namespace' becomes the declared former prefixes, never the current one: bare `wip/` here is current, not legacy; and its rename step obeys S7 (never a ref with an open pull request)."
- shipped-in: `101baa50a112`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- No setting covers the transition today (checked: namespacePrefix, workRefTemplate, workRefPrefix, publicationRefPrefix, foreignRefPrefixes), so one is added: `development.branches.formerNamespacePrefixes` (default []), documented as transition-only.
- The resolved policy exposes, once, the owned work-ref and publication prefixes: the current ones composed from namespacePrefix, then the same shapes for each former prefix. Every later slice reads these lists and nothing else.
- Spec: `namespacePrefix: ""` resolves to `heads/wip/`, `pr/` and `refs/<x>`; `"delendai"` to `heads/delendai/wip/` and `delendai/pr/`; a former `delendai` beside an empty current yields both, current first.
- The ref guard accepts commits and pushes to an existing live unit or publication under a former prefix; every NEW unit and publication is named under the current prefix by `work enter` and `work publish` (the guard does not refuse a branch-create there, which re-entering an old unit needs).
- Ref identity parses a unit under any owned prefix to the same agent/kind/proposal/slice/generation/topic, so `work enter` on an existing `delendai/wip/...` unit re-enters it (no second unit, as work-ref-migration.spec.ts already requires for old shapes).
- namespacedRef keeps writing under the current namespace; a new `ownedRefRoots(policy, part)` returns the current root then each former one for readers.
- Spec: both prefixes recognised in the transition; a new unit is named under the current prefix.
- `refs/${namespacePrefix}/retired/*` (unit-reaper, work-unit-generation) becomes namespacedRef, which is git-valid with an empty prefix.
- stranded-edits with an empty prefix scans only the owned roots, never every ref under refs/remotes/origin.
- Retired-tip, stranded and claim readers look under every owned root, so a tip kept under refs/delendai/retired stays found. The id and review reservations stay at one fixed hidden ref each (compare-and-swap on one ref; two namespaces would let two allocators take the same id), so an id is never issued twice.
- publish-proposal takes the publication prefix from the policy, falling back to the default policy's. create_proposal's no-policy fallback is left as it was.
- The queue arms, and candidate-disposition disposes, publications under every owned publication prefix; FORWARD_SYNC_REF_PREFIX is derived from the current publicationRefPrefix.
- maintain-ref-namespace, ref-lifecycle --reap and agent-claims treat refs under a former prefix as delendai's (reaped or kept by the same rules), and refs outside every owned prefix as foreign.
- Spec per script: a fixture with one `delendai/pr/...` and one `pr/...` publication under `namespacePrefix: ""` + former `delendai` handles both.
- Rendered rulesets and branch protection cover the work and publication refs of every owned prefix.
- ci.yml's two `delendai/pr/` head filters (publication dispatch and the queue job) accept each owned publication prefix; YAML cannot read the policy, so branch-protection-guard fails when the prefixes ci.yml names differ from the resolved policy's owned publication prefixes.
- `delendai work rename-namespace` is a dry run unless `--apply`; it has a help summary.
- It refuses as a whole while any open pull request has its head under a former prefix, and when the forge cannot be read; it checks each ref again just before acting.
- Each ref is renamed by pushing the new name at the same tip, verifying it, keeping the old tip under the retired root, then deleting the old name. The forge rename API is never called.
- When no ref is left under a former prefix it says so and names the config line to remove.
- Spec: no rename of a ref with an open pull request; tips identical before and after.
- delendai.config.json sets `namespacePrefix: ""` and `formerNamespacePrefixes: ["delendai"]`, and ci.yml's publication filters name both prefixes; only this repository's config changes, and no existing ref is renamed. The readable template of S9 is not switched on here yet: generation bookkeeping (`endedGenerations`) still reads `-g<n>` from names.
- After it lands a new unit here enters `wip/<agent>/...` and publishes `pr/<agent>/...`, while every existing `delendai/...` unit keeps entering, checkpointing and publishing under its own name until it ends.
- q00040 S4's 'old namespace' becomes the declared former prefixes, never the current one: bare `wip/` here is current, not legacy; and its rename step obeys S7 (never a ref with an open pull request).
- The readable template, chosen with `workRefTemplate` (publications use the same shape after `publicationRefPrefix`), is `{wip|pr}/{action}/{agent}/{scope}/{topic}`, the owner's scheme (`READABLE_WORK_REF_SHAPE`). It is not yet the library default: 74 specs and the generation bookkeeping assume the current shape. With this repository's empty prefix the names start directly with `wip/` or `pr/`: `wip/implement/claude-opus-5-5/x01003/shared-checkout-stays-clean`, `pr/implement/claude-opus-5-5/x01003-S2/work-ref-refuses-shared-checkout`, `wip/review/gpt-5.3-codex/x01004+x01016/verdicts`.
- action is implement, review, create or fix. scope is a proposal (`x01003`), one slice (`x01003-S2`), a range (`x01003-S1-S3`), a set (`x01003-S1+S4`) or several proposals (`x01004+x01016`), with `-G{n}` (uppercase) only from the second generation on (`x01003-G2`). Only `-` and `+` join parts: `[ ]`, `~`, `..` and spaces are not valid in git refs. topic is a short human summary of what the branch integrates; on a publication, of what that pull request ships.
- Spec: the scope grammar is parsed and rendered both ways for proposal, slice, range, set, multi-proposal and generation, and every rendered name passes `git check-ref-format`.
- Both forms are recognised in the transition: every owned-namespace parser reads the readable shape and the current one, under the current and the former namespace. Reading the identity from the `Delendai-Wip-Ref` trailer first is left to a follow-up.
- A unit under the earlier shape or namespace still enters, checkpoints and publishes under its own name. No ref with an open pull request is ever renamed.
