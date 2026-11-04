---
id: f00808
title: "delendai's own branches drop the delendai/ prefix, read from the policy"
kind: feat
status: in-progress
type: proposal
track: general
date: 2026-11-04
last-transition-id: 00946786-73bd-40d6-8037-ddf11c999d10
last-correlation-id: 00946786-73bd-40d6-8037-ddf11c999d10
last-transition-from: ready
last-transition-at: 2026-11-04T15:10:26.035Z
---

# f00808 — delendai's own branches drop the delendai/ prefix, read from the policy

## goal

In this repository new work refs are `wip/<agent>/...` and publications `pr/<agent>/...`; every consumer of the prefix reads it from the resolved development policy (`branches.namespacePrefix`, which already exists), recognises the old `delendai/` prefix until its last unit ends, and the old refs are renamed only by an explicit command that refuses while any of them carries an open pull request.

## why

The owner wants this repository, which is delendai itself, to stop prefixing its branches with `delendai/`: the prefix exists so that OTHER projects can tell delendai's branches apart from their own, and in delendai's own repository every branch is delendai's. `init` must keep `delendai/` as the default for every other project. Survey 2026-11-04: the setting is already there (`development.branches.namespacePrefix`, composed into workRefTemplate, workRefPrefix and publicationRefPrefix in packages/core/src/lib/development-policy/resolve.ts) and most of core reads it, but several consumers still spell `delendai/` or `refs/delendai/` literally (ci.yml lines 1497 and 1539, FORWARD_SYNC_REF_PREFIX, agent-claims lint, publish-proposal and create_proposal fallbacks, the proposal-id reservation and retired/claims hidden refs, `refs/${prefix}/retired/*` in two reapers), nothing recognises a FORMER prefix, so flipping the config today would orphan every live `delendai/` unit and split the id allocator. Finding against the request: init does NOT write a prefix today: adopt.ts writes only integration and release, and the library default in profiles.ts is empty, so new consumer projects already get bare `wip/` and `pr/`; S6 makes `delendai` init's written default, as the owner intends. A past rename through the GitHub API closed all 7 open pull requests, so the migration never renames a ref with an open pull request.

## non-goals

- Changing the library default in profiles.ts (stays empty) or rewriting any existing project's config: adoption never overwrites a declared policy.
- Renaming refs automatically at startup or in a reaper: renaming is only the explicit command of S7.
- Using the forge's branch-rename API for anything.

## slices

- global_gate: type

### S1 — Former prefixes are part of the policy
- **Status**: pending
- **Files**: `packages/core/src/lib/contracts/interfaces/development-policy.interface.ts`, `packages/core/src/lib/development-policy/resolve.ts`, `packages/core/src/lib/plugins/development-config-schema.constant.ts`, `packages/core/schema/delendai.config.schema.json`, `packages/core/tests/src/lib/development-policy/resolve.spec.ts`
- **Gate**: type
- acceptance:
  - "No setting covers the transition today (checked: namespacePrefix, workRefTemplate, workRefPrefix, publicationRefPrefix, foreignRefPrefixes), so one is added: `development.branches.formerNamespacePrefixes` (default []), documented as transition-only."
  - "The resolved policy exposes, once, the owned work-ref and publication prefixes: the current ones composed from namespacePrefix, then the same shapes for each former prefix. Every later slice reads these lists and nothing else."
  - "Spec: `namespacePrefix: ""` resolves to `heads/wip/`, `pr/` and `refs/<x>`; `"delendai"` to `heads/delendai/wip/` and `delendai/pr/`; a former `delendai` beside an empty current yields both, current first."

### S2 — Guards and ref identity recognise both prefixes
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `packages/core/src/lib/development-policy/git-guard-namespaces.ts`, `packages/core/src/lib/startup-reconciler/work-ref-identity.ts`, `packages/core/src/lib/work-units/namespaced-ref.helper.ts`, `packages/core/tests/src/lib/work-units/namespaced-ref.helper.spec.ts`, `packages/core/tests/src/lib/development-policy/git-guard-namespaces.spec.ts`
- **Gate**: type
- acceptance:
  - "The ref guard accepts commits and pushes to an existing live unit or publication under a former prefix, and creates every NEW unit and publication under the current prefix only."
  - "Ref identity parses a unit under any owned prefix to the same agent/kind/proposal/slice/generation/topic, so `work enter` on an existing `delendai/wip/...` unit re-enters it (no second unit, as work-ref-migration.spec.ts already requires for old shapes)."
  - "namespacedRef keeps writing under the current namespace; a new `ownedRefRoots(policy, part)` returns the current root then each former one for readers."
  - "Spec: both prefixes recognised in the transition; a new unit under a former prefix is refused."

### S3 — Hidden refs and proposal tools stop spelling refs/delendai
- **Status**: pending
- **DependsOn**: [S2]
- **Files**: `packages/core/src/lib/work-units/unit-reaper.service.ts`, `packages/core/src/lib/work-units/work-unit-generation.service.ts`, `packages/core/src/lib/work-units/stranded-edits.service.ts`, `packages/core/tests/src/lib/work-units/stranded-edits.service.spec.ts`, `plugins/proposals/src/lib/proposals/proposal-id-sources.ts`, `plugins/proposals/tests/src/lib/proposals/proposal-id-sources.spec.ts`, `plugins/proposals/src/lib/services/carried-work.service.ts`, `plugins/proposals/src/lib/contracts/constants/review-reservation.constant.ts`, `plugins/proposals/src/lib/tools/publish-proposal.ts`, `plugins/proposals/tests/src/lib/tools/publish-proposal.spec.ts`, `plugins/proposals/src/lib/tools/authoring/create-proposal.tool.ts`
- **Gate**: type
- acceptance:
  - "`refs/${namespacePrefix}/retired/*` (unit-reaper, work-unit-generation) becomes namespacedRef, which is git-valid with an empty prefix."
  - "stranded-edits with an empty prefix scans only the owned roots, never every ref under refs/remotes/origin."
  - "The id allocator, retired-tip, claim and review-reservation readers look under every owned root, so a tip kept under refs/delendai/retired stays found and an id reserved under refs/delendai/ids is never issued twice."
  - "publish-proposal and create_proposal take the publication prefix from the policy; no `delendai/pr/` fallback remains."

### S4 — Queue, publications and reapers take the prefix from the policy
- **Status**: pending
- **DependsOn**: [S2]
- **Files**: `tools/scripts/forge/keep-the-queue-moving.script.ts`, `tools/scripts/forge/keep-the-queue-moving.script.spec.ts`, `tools/scripts/forge/candidate-disposition.ts`, `tools/scripts/forge/candidate-disposition.spec.ts`, `tools/scripts/forge/forward-sync-release.script.ts`, `tools/scripts/forge/forward-sync-release.script.spec.ts`, `tools/scripts/forge/close-unpublished-prs.script.ts`, `tools/scripts/git/maintain-ref-namespace.script.ts`, `tools/scripts/git/maintain-ref-namespace.script.spec.ts`, `tools/scripts/lint/ref-lifecycle-guard.script.ts`, `tools/scripts/lint/ref-lifecycle-guard.script.spec.ts`, `tools/scripts/lint/agent-claims.script.ts`, `tools/scripts/lint/closed-with-independent-approval.script.ts`, `packages/cli/src/lib/review/review-releases.service.ts`
- **Gate**: type
- acceptance:
  - "The queue arms, and candidate-disposition disposes, publications under every owned publication prefix; FORWARD_SYNC_REF_PREFIX is derived from the current publicationRefPrefix."
  - "maintain-ref-namespace, ref-lifecycle --reap and agent-claims treat refs under a former prefix as delendai's (reaped or kept by the same rules), and refs outside every owned prefix as foreign."
  - "Spec per script: a fixture with one `delendai/pr/...` and one `pr/...` publication under `namespacePrefix: ""` + former `delendai` handles both."

### S5 — Forge rules and CI filters follow the policy
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `tools/scripts/governance/forge-settings.lib.ts`, `tools/scripts/governance/forge-settings.lib.spec.ts`, `.github/branch-protection.yml`, `.github/branch-protection.ts`, `.github/workflows/ci.yml`, `lefthook.yml`, `tools/scripts/lint/branch-protection-guard.script.ts`
- **Gate**: type
- acceptance:
  - "Rendered rulesets and branch protection cover the work and publication refs of every owned prefix."
  - "ci.yml's two `delendai/pr/` head filters (publication dispatch and the queue job) accept each owned publication prefix; YAML cannot read the policy, so branch-protection-guard fails when the prefixes ci.yml names differ from the resolved policy's owned publication prefixes."

### S6 — init writes delendai as the default namespace
- **Status**: pending
- **Files**: `packages/core/src/lib/development-policy/adopt.ts`, `packages/core/tests/src/lib/development-policy/adopt.spec.ts`
- **Gate**: type
- acceptance:
  - "Today adopt.ts writes only integration and release and the library default is empty, so init gives consumer projects bare `wip/`. Adoption now writes `branches.namespacePrefix: "delendai"`, which makes `delendai/` init's default as the owner intends; the profiles.ts default stays empty and a project that already declares a development block is never rewritten."
  - "Spec: a fresh init declares `delendai`, a project resolves `heads/delendai/wip/` and `delendai/pr/`, and an existing config is left untouched."

### S7 — An explicit command renames the remaining old refs, never one with an open pull request
- **Status**: pending
- **DependsOn**: [S3, S4]
- **Files**: `packages/core/src/lib/work-units/namespace-rename.service.ts`, `packages/core/tests/src/lib/work-units/namespace-rename.service.spec.ts`, `packages/cli/src/commands/work.command.ts`, `packages/cli/src/commands/work-ref-migration.spec.ts`
- **Gate**: type
- acceptance:
  - "`delendai work rename-namespace` is a dry run unless `--apply`; it has a help summary."
  - "It refuses as a whole while any open pull request has its head under a former prefix, and when the forge cannot be read; it checks each ref again just before acting."
  - "Each ref is renamed by pushing the new name at the same tip, verifying it, keeping the old tip under the retired root, then deleting the old name. The forge rename API is never called."
  - "When no ref is left under a former prefix it says so and names the config line to remove."
  - "Spec: no rename of a ref with an open pull request; tips identical before and after."

### S8 — This repository switches, and q00040 learns the current namespace
- **Status**: pending
- **DependsOn**: [S2, S3, S4, S5]
- **Files**: `delendai.config.json`, `docs/delendai/proposals/ready/plans/q00040-plan-spent-branches-end-in-every-project-on-every-forge.md`
- **Gate**: none
- acceptance:
  - "delendai.config.json sets `namespacePrefix: ""` and `formerNamespacePrefixes: ["delendai"]`; only this repository's config changes."
  - "After it lands a new unit here enters `wip/<agent>/...` and publishes `pr/<agent>/...`, while every existing `delendai/...` unit keeps entering, checkpointing and publishing under its own name until it ends."
  - "q00040 S4's 'old namespace' becomes the declared former prefixes, never the current one: bare `wip/` here is current, not legacy; and its rename step obeys S7 (never a ref with an open pull request)."

## acceptance

- No setting covers the transition today (checked: namespacePrefix, workRefTemplate, workRefPrefix, publicationRefPrefix, foreignRefPrefixes), so one is added: `development.branches.formerNamespacePrefixes` (default []), documented as transition-only.
- The resolved policy exposes, once, the owned work-ref and publication prefixes: the current ones composed from namespacePrefix, then the same shapes for each former prefix. Every later slice reads these lists and nothing else.
- Spec: `namespacePrefix: ""` resolves to `heads/wip/`, `pr/` and `refs/<x>`; `"delendai"` to `heads/delendai/wip/` and `delendai/pr/`; a former `delendai` beside an empty current yields both, current first.
- The ref guard accepts commits and pushes to an existing live unit or publication under a former prefix, and creates every NEW unit and publication under the current prefix only.
- Ref identity parses a unit under any owned prefix to the same agent/kind/proposal/slice/generation/topic, so `work enter` on an existing `delendai/wip/...` unit re-enters it (no second unit, as work-ref-migration.spec.ts already requires for old shapes).
- namespacedRef keeps writing under the current namespace; a new `ownedRefRoots(policy, part)` returns the current root then each former one for readers.
- Spec: both prefixes recognised in the transition; a new unit under a former prefix is refused.
- `refs/${namespacePrefix}/retired/*` (unit-reaper, work-unit-generation) becomes namespacedRef, which is git-valid with an empty prefix.
- stranded-edits with an empty prefix scans only the owned roots, never every ref under refs/remotes/origin.
- The id allocator, retired-tip, claim and review-reservation readers look under every owned root, so a tip kept under refs/delendai/retired stays found and an id reserved under refs/delendai/ids is never issued twice.
- publish-proposal and create_proposal take the publication prefix from the policy; no `delendai/pr/` fallback remains.
- The queue arms, and candidate-disposition disposes, publications under every owned publication prefix; FORWARD_SYNC_REF_PREFIX is derived from the current publicationRefPrefix.
- maintain-ref-namespace, ref-lifecycle --reap and agent-claims treat refs under a former prefix as delendai's (reaped or kept by the same rules), and refs outside every owned prefix as foreign.
- Spec per script: a fixture with one `delendai/pr/...` and one `pr/...` publication under `namespacePrefix: ""` + former `delendai` handles both.
- Rendered rulesets and branch protection cover the work and publication refs of every owned prefix.
- ci.yml's two `delendai/pr/` head filters (publication dispatch and the queue job) accept each owned publication prefix; YAML cannot read the policy, so branch-protection-guard fails when the prefixes ci.yml names differ from the resolved policy's owned publication prefixes.
- Today adopt.ts writes only integration and release and the library default is empty, so init gives consumer projects bare `wip/`. Adoption now writes `branches.namespacePrefix: "delendai"`, which makes `delendai/` init's default as the owner intends; the profiles.ts default stays empty and a project that already declares a development block is never rewritten.
- Spec: a fresh init declares `delendai`, a project resolves `heads/delendai/wip/` and `delendai/pr/`, and an existing config is left untouched.
- `delendai work rename-namespace` is a dry run unless `--apply`; it has a help summary.
- It refuses as a whole while any open pull request has its head under a former prefix, and when the forge cannot be read; it checks each ref again just before acting.
- Each ref is renamed by pushing the new name at the same tip, verifying it, keeping the old tip under the retired root, then deleting the old name. The forge rename API is never called.
- When no ref is left under a former prefix it says so and names the config line to remove.
- Spec: no rename of a ref with an open pull request; tips identical before and after.
- delendai.config.json sets `namespacePrefix: ""` and `formerNamespacePrefixes: ["delendai"]`; only this repository's config changes.
- After it lands a new unit here enters `wip/<agent>/...` and publishes `pr/<agent>/...`, while every existing `delendai/...` unit keeps entering, checkpointing and publishing under its own name until it ends.
- q00040 S4's 'old namespace' becomes the declared former prefixes, never the current one: bare `wip/` here is current, not legacy; and its rename step obeys S7 (never a ref with an open pull request).
