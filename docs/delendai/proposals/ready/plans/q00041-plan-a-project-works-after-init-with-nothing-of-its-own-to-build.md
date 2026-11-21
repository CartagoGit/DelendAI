---
id: q00041
title: "Plan: a project works after init, with nothing of its own to build"
kind: plan
status: ready
type: proposal
track: a00095-consistency
date: 2026-11-03
---

# q00041 — Plan: a project works after init, with nothing of its own to build

## goal

A project that runs `delendai init` with no flags gets a whole, correct flow that lands work directly. delendai applies the forge settings, ships the checks the project needs and installs a plugin pack that fits. No agent in the project has to write infrastructure delendai should have shipped.

## why

The owner reported on 2026-11-03 that projects using delendai have to be configured and repaired by hand before delendai half works. The owner also stated the default they want: a new project lands work directly, with neither a pull request nor a merge step, the flow is correct by default, and the other routes stay available through options.

In games/pcf-mods/6, agents spent a day building what delendai should have shipped (its git history, 2026-11-02 and 2026-11-03):

- **#7 `scripts/governance.ts`, a forge "broker".** The boot reported `startup-reconciliation.governance.drift: Live governance differs from the policy on 6 propert(ies); applying is the broker's job, not the boot's`. No broker exists for a consumer.
- **#17, a gate that a work ref may not outlive its unit.** Nothing in the product ends spent refs (q00040).
- **`shared/modules/jsonc.module.ts`.** The project's own gate had to read `delendai.config.json` "with nothing installed", and delendai's JSONC parser is internal.
- **#8 and #10 on presets.** The closest preset was `dogfood`: 38 plugins, with 7 excluded by hand and 7 added. A plugin-authoring skill came with it, though the project authors one plugin at most (f00803 redoes the presets).
- **#20, a refs script that re-implemented `work retire`, worse.** It deleted branches instead of retiring units. The agent did not know the product already did it.

On the default flow: commit 70f27f8fc (2026-09-21) changed the default from `shared-direct` to `shared-checkout-merge`. Under `shared-direct` there was no work ref, so every agent edited the shared checkout and the guards refused them. The owner's direct default and that commit's isolation are both kept here: each agent works in its own unit, and a proved unit lands on the integration branch by fast-forward, with no pull request, no merge commit and nothing asked of the forge.

External audit (ChatGPT, 2026-11-04, against develop f7f53bf8d), finding 10. Claim: the quickstart is not proved per host. Not verified in code; S5 here is the proof and gets this requirement.

## non-goals

- Removing the pull-request and merge routes: they stay, chosen by `--profile` or by `development.branches.rules` (f00801).
- Giving up isolation between agents: a unit remains the only place an agent edits.
- Writing forge settings without the person's consent and credentials: delendai applies them only when asked, with what the person grants.

## slices

- global_gate: none

### S1 — Direct by default, and whole
- **Status**: pending
- **Files**: `packages/core/src/lib/development-policy/profiles.constant.ts`, `packages/core/src/lib/development-policy/profiles.ts`
- **Gate**: type
- acceptance:
  - "With no profile named, a unit is proved by the local gate and lands on the integration branch by fast-forward, after being brought up to date, with no pull request and no merge commit. Agents still edit only in their own unit. A flag or config key chooses pull-request or merge instead. Projects that name no profile today keep their behaviour until init is re-run, which says what changes."

### S2 — delendai applies the forge settings
- **Status**: pending
- **Files**: `packages/core/src/lib/forge-governance/build-desired-state.ts`
- **Gate**: type
- acceptance:
  - "A boot that finds the forge differing from the policy names the one delendai command that applies the difference, with the person's credentials and consent, so no project writes a broker of its own."

### S3 — No project writes its own gate
- **Status**: pending
- **Files**: `packages/cli/src/lib/init/init-development-setup.service.ts`
- **Gate**: type
- acceptance:
  - "The invariants a project needs run from the installed delendai, in the hook and the CI step init sets up: no work ref outlives its unit, and the plugin set matches the config. A project needs no JSONC reader, refs script or gate of its own, and the agent instructions say which delendai command does each of these jobs."

### S4 — The pack fits without exclusions
- **Status**: pending
- **Files**: `packages/cli/src/lib/init/init-skill-inventory.constant.ts`
- **Gate**: type
- acceptance:
  - "init picks the pack from what the project is, and a normal project needs no exclude list. Skills a project does not use, such as plugin authoring, are installed only when it authors plugins."

### S5 — Proved on a fresh project
- **Status**: pending
- **Files**: `docs/delendai/proposals/ready/plans/q00041-plan-a-project-works-after-init-with-nothing-of-its-own-to-build.md`
- **Gate**: none
- acceptance:
  - "On a fresh project after `init` with no flags, two agents' units land on the integration branch, nothing is left behind, and the project gains no module of its own. The run is recorded in this proposal's notes."
  - "The quickstart is proved automatically from a clean checkout for each supported host (CI job, not a manual run); a host whose quickstart fails fails the job, naming the host."

## acceptance

- With no profile named, a unit is proved by the local gate and lands on the integration branch by fast-forward, after being brought up to date, with no pull request and no merge commit. Agents still edit only in their own unit. A flag or config key chooses pull-request or merge instead. Projects that name no profile today keep their behaviour until init is re-run, which says what changes.
- A boot that finds the forge differing from the policy names the one delendai command that applies the difference, with the person's credentials and consent, so no project writes a broker of its own.
- The invariants a project needs run from the installed delendai, in the hook and the CI step init sets up: no work ref outlives its unit, and the plugin set matches the config. A project needs no JSONC reader, refs script or gate of its own, and the agent instructions say which delendai command does each of these jobs.
- init picks the pack from what the project is, and a normal project needs no exclude list. Skills a project does not use, such as plugin authoring, are installed only when it authors plugins.
- On a fresh project after `init` with no flags, two agents' units land on the integration branch, nothing is left behind, and the project gains no module of its own. The run is recorded in this proposal's notes.
- The quickstart is proved automatically from a clean checkout for each supported host.
