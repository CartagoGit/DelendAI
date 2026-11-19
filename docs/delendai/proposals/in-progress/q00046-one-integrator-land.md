---
id: q00046
title: "One integrator: land"
kind: plan
status: in-progress
type: proposal
track: general
date: 2026-11-08
last-transition-id: c35cfd21-860e-4ca5-ab88-cdb1843099be
last-correlation-id: c35cfd21-860e-4ca5-ab88-cdb1843099be
last-transition-from: ready
last-transition-at: 2026-11-08T21:48:41.508Z
---

# q00046 — One integrator: land

## goal

Integration has one actor, `land`, one decisions module in core that every reader shares, and one branch and one pull request per unit. Nothing of the old mechanism survives next to it.

## why

Measured on 2026-11-08: the integration code (tools/scripts/forge and tools/scripts/git) is about 18,800 lines in 61 files. 117 of develop's 210 commits that day (56%) were bookkeeping. 9 integration failures were found only in production that day: the forge ruleset, the pre-push guard, an empty generated catalog, derived-file drift, the commit-branch lint, the refresher disagreeing with the queue, a ref loop between the checkout publisher and ref maintenance, a proposal duplicated across folders, and claim leaving old PRs open. GitHub's native merge queue is unavailable for user-owned repositories. The cause is the same each time: several actors decide one fact with separate logic, the machinery blocks its own repair, nothing is rehearsed, and a stale process on the owner's machine keeps acting after the rules changed.

## non-goals

- Do not change code in this proposal's planning; each slice is its own change.
- Do not depend on a forge feature a project may lack: only the four adapter calls above.

## architecture

### design

**One actor.** One workflow `land`, concurrency 1, runs on: a PR's CI finishing, a PR marked ready, every push to the integration branch, and every 15 minutes. It keeps no state of its own and reads the forge on every pass. No LLM is involved; an agent only runs `work deliver`.

**Each pass, over the ready PRs:**

- skip a PR whose required checks are not green on its head;
- group the PRs by section overlap, using the same section function the CI selection uses (the specs and zones a change selects, tools/scripts/ci/test-scope.ts and zone-reads.ts), never a second one;
- a PR with no overlap against what landed since its tested base merges through the forge API, pinned to its head SHA;
- several ready PRs that overlap each other get ONE readable batch PR (`<ns>/queue/batch-a+b+c`) over the current tip, whose sectioned CI runs once over the union. Green: each member is merged, pinned to its SHA, and the resulting tree is checked equal to the tested one. Red: the culprit is attributed from the failing jobs and specs against the members' footprints, labelled with the reason and the run link, and the rest re-batch once. With no single owner, only the members that meet the failure go alone. The same set is never re-batched on the same tip;
- groups that do not overlap proceed in parallel;
- a text conflict in derived files is regenerated and committed; a conflict in authored code labels the PR "needs update" for its author.

**After a merge.** The integration CI (sectioned) and the promotion run through `workflow_run` triggers on `land`. A red develop opens one urgent repair and blocks nobody. The full suite runs only on the promotion develop to main.

**Locally,** the shared checkout only fetches and fast-forwards.

**A unit is one branch and one PR.** A draft PR opens at `work enter`; CI skips drafts; `work deliver` marks it ready.

**The forge adapter needs** check status, merge pinned to a SHA, update-branch and label. It is agnostic: GitLab has all four.

### single source of truth

No partial migration and no second way. Four rules bind every slice:

1. One decisions module in core (S2) is the only code that computes ready, overlap, grouping, culprit, landed and allowed namespaces. A lint refuses any other module that does.
2. The cutover (S4) is atomic: the change that switches to `land` deletes, in the same change, every replaced workflow, script and host cadence in the inventory below.
3. A process older than the cutover cannot act: `land` records an integration-protocol version in the repo; a process with an older protocol refuses to move refs or PRs and says to restart.
4. Nothing is deleted before the rehearsal (an end-to-end spec against a fake forge plus the adapted i00005 `forge:rehearse-train`) passes.

### inventory

Measured by grep on 2026-11-08 (S1 re-runs it before S4 and fails the build on any actor missing from this table). Verdicts: KEEP (named owner), REPLACED (its decision moves into `land` or the decisions module and the old module is deleted), DELETED (no successor needed). Counts at the end.

#### Workflows (.github/workflows, 18 files)

| Actor | Decides | Verdict |
|---|---|---|
| keep-the-queue-moving.yml (push develop, schedule) | which PRs to update, arm, advance | REPLACED by land |
| open-promotion.yml (hourly cron) | when develop to main opens | REPLACED by land (promotion via workflow_run) |
| forward-sync-release.yml (push main) | bring main back into develop | REPLACED by land (workflow_run on the promotion) |
| verify-develop-health.yml (nightly) | whether develop and main are healthy | REPLACED by land (red develop opens one urgent repair) |
| tier3.yml job develop-health | duplicate of the health check | DELETED (job only; tier3 stays) |
| ci.yml | sectioned checks per PR, skips drafts after S5 | KEEP (owner: ci) |
| drift.yml, surface-bootstrap.yml | derived-file and bootstrap drift on develop | KEEP (owner: ci) |
| codeql.yml, dependency-snapshot.yml | security scans | KEEP (owner: security) |
| tier2.yml, release-pr-gate.yml | full suite on develop to main | KEEP (owner: promotion) |
| tier3.yml, quality-gate.yml, pack-smoke.yml | nightly and packaging checks | KEEP (owner: ci) |
| release.yml, pages.yml, rotate-npm-token.yml | release, site, token reminder | KEEP (owner: release) |
| setup-bun.yml | shared setup | KEEP (owner: ci) |

#### tools/scripts/forge (27 modules)

| Actor | Decides | Verdict |
|---|---|---|
| advance-queue | the queue moves after a merge | DELETED |
| keep-the-queue-moving (1,317 lines) | update, arm, advance, park | DELETED (land replaces it) |
| queue-arming | a candidate is armed on evidence | DELETED (nothing is armed; land merges) |
| train-fallback | a train that cannot run | DELETED |
| release-checkout | give the shared checkout back | DELETED (the checkout only fast-forwards) |
| candidate-overlap-report | what sent merged PRs back | DELETED (S7 KPIs cover it) |
| publish-candidate (1,102 lines), publish-cleanup | publish a unit as a pr/ ref and PR | DELETED in S5 (replaced by draft PR at enter and ready at deliver) |
| open-publication-prs, close-unpublished-prs | open and close PRs for pr/ refs | DELETED in S5 |
| candidate-disposition, queue-acceptance, queue-order | what happens to each candidate, which lands, which first | REPLACED by the decisions module |
| independent-candidates, candidate-footprint, candidate-tested-base | overlap, footprint, tested base | REPLACED by the decisions module |
| publication-prefixes, certify-integration | allowed namespaces, what is landed and certified | REPLACED by the decisions module |
| train-assembly | build the batch over the tip | KEEP (owner: land, the batch builder) |
| train-rehearsal (module and script) | rehearse the integration | KEEP (owner: rehearsal, adapted from i00005) |
| open-promotion, forward-sync-release, promotion-alerts | the promotion steps | KEEP (owner: land, as phases it calls) |
| section-health | red per section | KEEP (owner: land, the repair trigger) |
| sync-with-integration | local fetch and fast-forward | KEEP (owner: host, the one local follower) |
| link-train-dependencies | give a batch worktree its modules | KEEP (owner: land) |

#### tools/scripts/git (14 modules)

| Actor | Decides | Verdict |
|---|---|---|
| refresh-candidate-artifacts (829 lines) | bring a PR forward, regenerate derived files | DELETED (land's conflict policy replaces it) |
| hydrate-candidates-after-merge, hydration-lock | hydrate candidates when develop moves | DELETED |
| maintain-ref-namespace (632 lines) | re-push and prune work refs | DELETED |
| orphan-rescue | keep an orphan candidate moving | DELETED |
| reap-finished-units | clean finished units on this machine | DELETED (work retire and merge end a unit) |
| stale-verdict-conflicts | resolve verdict-pack conflicts | REPLACED by land's derived-conflict policy |
| tools/scripts/proposals/close-approved-proposals (script and spec), sent-back-proposals | close a proposal whose every slice is approved, in a review unit and one PR | KEEP (owner: host follower, run after each merge the checkout follows, replacing its old caller the hydration; S5's reconciler takes it over) |
| generated-merge-driver | derived files never conflict | KEEP (owner: land calls it) |
| check-workflow-invariants, clone-hygiene, harden-git-hooks, prepare-clone | clone and hook hygiene | KEEP (owner: git hygiene) |
| ended-reservations, rewrite-llm-attribution | reservations, history rewrite | KEEP (owner: reviews, history) |

#### Host cadences on the owner's machine

| Actor | Decides | Verdict |
|---|---|---|
| host-server hydration timer (startCheckoutHydration) | fast-forward plus hydrate on a clock | DELETED (fast-forward stays as the follower, no hydrate) |
| host-server candidate refresh interval | refresh candidates on a clock | DELETED |
| lefthook post-merge hydrate-candidates | hydrate after a local merge | DELETED |
| work-checkout-publisher cadence (packages/core wip-engine) | push every checked-out work ref | DELETED in S5 |
| ref maintenance cadence (maintain-ref-namespace under the host) | re-push and prune refs | DELETED |
| unit reaper timers (unit-reaper, stray-refs-reap, finished-units-end) | end idle and finished units | KEEP (owner: work-units), event driven by work commands, no timer |
| kept-unit-hydration | hydrate kept units | DELETED |
| host-server, host-supervisor(-process), branch-runtime, forge-seam.service, record-lifecycle, workspace-forge-slug | host plumbing | KEEP (owner: host); host-server loses the two timers above |

#### Core readers of the same facts

| Actor | Decides | Verdict |
|---|---|---|
| landed-work.service, wip-engine/landed-work-ref, retired-landed, unit-forge-sync | is it landed | REPLACED by the decisions module |
| publication-dispositions, publication-standings, sibling-publications, remote-unit-standing, pull-request-urgency | ready, waiting, urgent | REPLACED by the decisions module |
| development-policy owned-ref-prefixes, owned-work-ref-parser, git-guard-namespaces, namespaced-ref.helper | allowed namespaces | REPLACED by the decisions module |
| work-publish, work-claim, work-retire | publish, claim, retire a unit | KEEP (owner: work-units); publish and claim lose their pr/ ref and extra-PR paths in S5 |
| create-mcp-project cadence wiring | starts the host cadences | KEEP (owner: host), edited to start none of the deleted ones |

#### Guard, ruleset, lints, extension

| Actor | Decides | Verdict |
|---|---|---|
| packages/cli guard.command (pre-commit, pre-push) | which refs and commits are allowed | KEEP (owner: guard), reads the decisions module |
| governance/forge-settings.lib, .github/settings.yml, branch-protection.yml and .ts | the ruleset and its namespaces | KEEP (owner: governance), generated from the decisions module |
| lints ref-lifecycle-guard, namespace-ruleset-guard, commit-branch-discipline, publication-scope, publication-proof-gate, silent-work-refs, in-progress-work-refs, branch-protection-guard | namespace and ref shape readers | KEEP (owner: lint), each reads the decisions module |
| extensions/vscode proposals-snapshot and board providers | what is under test, waiting, landed | KEEP (owner: extension), reads the decisions module |
| package.json scripts forge:refresh, forge:namespace, forge:release | entry points of deleted modules | DELETED |
| package.json script forge:publish | entry point of publish-candidate | DELETED in S5 |
| package.json scripts forge:rehearse-train, forge:forward-sync, forge:promotion-alerts | rehearsal and promotion phases | KEEP (owner: rehearsal, land) |

Counts: KEEP 57, REPLACED 27, DELETED 28 (of which 7 land in S5 with the publication path). S1 recounts and the cutover spec compares against the recount.

## slices

- global_gate: none

### S1 — Inventory
- **Status**: pending
- **Files**: `docs/delendai/proposals/in-progress/q00046-integration-is-one-actor-one-branch-per-unit-plain-pull-requests.md`
- **Gate**: none
- acceptance:
  - "The inventory above is re-run by grep over workflows, scripts, host modules, core work-units and the guard, ruleset, lint and extension readers, and every actor found is in the table with a verdict"
  - "Each KEEP names an owner and each REPLACED or DELETED names its successor or the reason it needs none"

### S2 — The decisions module
- **Status**: done
- **shipped-in**: c62d59622
- **DependsOn**: [S1]
- **Files**: `packages/core/src/lib/integration/decisions/namespaces.helper.ts`
- **Gate**: none
- acceptance:
  - "One core module decides ready, overlap, grouping, culprit, landed and allowed namespaces; the overlap uses the CI selection's section function, not a copy"
  - "land (later), work status, the guard, the ruleset generator, the lints and the extension read it; each current reader is moved onto it in this slice"
  - "A lint refuses any other module that computes these decisions"

### S3 — land and its fake-forge spec
- **Status**: done
- **shipped-in**: 205cdbf9f
- **DependsOn**: [S2]
- **Files**: `tools/scripts/forge/train-assembly.ts`
- **Gate**: none
- acceptance:
  - "land runs with concurrency 1 on a PR's CI finishing, a PR marked ready, a push to the integration branch and every 15 minutes, keeps no state and reads the forge each pass"
  - "An end-to-end spec against a fake forge covers several PRs, overlap, a batch green and red with culprit attribution, a conflict in derived files and one in authored code, a head changing mid-pass and a failed pass"
  - "The adapter offers check status, merge pinned to a SHA, update-branch and label, with GitHub implemented and the contract stated for GitLab"
  - "The integration rehearsal (forge:rehearse-train adapted from i00005) passes against the fake forge"

### S4 — Atomic cutover and deletion
- **Status**: pending
- **Notes**: the engine switch is `development.integration.engine` (land|none) with `protocol` and `landWithoutChecks`, introduced here because q00047 S1 is ordered after this slice; q00047 S1 extends the same block. train-assembly is kept as land's batch builder and `forge:rehearse-train` became `forge:rehearse-land`, which builds in a throwaway clone. Left train refs and scratch worktrees are reaped by ref-lifecycle and work reap once they hold nothing of their own.
- **DependsOn**: [S3]
- **Files**: `.github/workflows/land.yml`, `tools/scripts/forge/land-cutover.spec.ts`
- **Gate**: none
- acceptance:
  - "The same change deletes every workflow, script and host cadence the inventory marks REPLACED or DELETED for the queue, hydration and ref maintenance; none is left behind"
  - "A spec asserts that no workflow, script or host module references the removed mechanism"
  - "land records an integration-protocol version in the repo; a process with an older protocol (a host server started before the cutover) refuses to move refs or PRs and says to restart"
  - "The rehearsal of S3 passes before the deletion lands"
  - "The engine switch moves from the repository variable DELENDAI_INTEGRATION_ENGINE (S3's interim gate) to the policy, development.integration.engine as q00047 S1 defines it, and the after-merge dispatch job of land.yml becomes workflow_run triggers, so the policy stays the one source of truth"
  - "After a merge, the sectioned integration CI and the promotion run through workflow_run on land; a red develop opens one urgent repair and blocks nobody; the full suite runs only on the promotion"

### Design note — who pushes (2026-11-10)

land runs with the workflow token, and GitHub builds nothing that token pushes: `update-branch` made bot-authored heads whose CI sat at `action_required`, and nothing merged for four hours after the cutover. A run dispatched on the same commit does not satisfy a pull request's required check (#911), so land cannot certify a combination itself. The rule is therefore: land never creates a commit, branch or pull request. It merges a pull request whose head is green and was pushed by an actor the forge builds; any other one it labels `delendai:needs-update` with the reason, and every pass prints a reason for every open pull request. The host, with the person's own git credentials, brings labelled pull requests forward (`bring-forward`: develop merged in, derived files regenerated, pushed without force, built in a throwaway clone). Batches stay off (`batches: false`) while land runs as the workflow token: overlapping pull requests land one at a time, the next brought forward after the first merges. The S5 reconciler owns the host side, and batches return only through an actor whose pushes the forge builds.

### S5 — The branch flow, part 1: one reconciler core derives and converges the desired state of every ref
- **Status**: pending
- **DependsOn**: [S4]
- **Files**: `new:packages/core/src/lib/ref-reconciler/reconciler.service.ts`, `new:packages/core/src/lib/ref-reconciler/desired-state.helper.ts`, `new:packages/core/src/lib/contracts/interfaces/ref-reconciler.interface.ts`, `new:packages/core/src/lib/contracts/constants/ref-kinds.constant.ts`, `new:packages/core/tests/src/lib/ref-reconciler/reconciler.service.spec.ts`, `new:tools/scripts/lint/ref-kinds-known.script.ts`, `new:tools/scripts/lint/ref-kinds-known.script.spec.ts`, `package.json`
- **Gate**: type
- **Decisions**: none
- **Notes**: the owner, 2026-11-10: stray branches keep piling up in history and must be handled automatically, never by an agent's decision. S4 deleted the train and hydration mechanisms; S5–S5j replace every remaining actor on refs, branches and worktrees with one reconciler. Split on 2026-11-18 from one slice whose Files named a single script; the original acceptance is distributed below unchanged in substance.
- acceptance:
  - "reconciler.service.spec.ts, over a fake forge, covers every transition from the unit registry plus the forge: a unit's branch and worktree are created at enter; fast-forwarded when the integration branch moves and the unit holds nothing of its own, reported when it holds work; deleted with the tip kept under the retired namespace when the work lands, its pull request closes or it is retired; an empty unit with a clean worktree is retired, never left on disk."
  - "reconciler.service.spec.ts shows a pass run twice changes nothing the second time, and no pass deletes a commit that exists nowhere else (integration branch, work, publication or retired ref): such a ref is kept and reported. Namespaces, branches, retirement and cadence come from development.branches and development.integration; nothing names this repository."
  - "`bun run lint:ref-kinds` (ref-kinds-known.script.ts, wired in package.json and in a CI lint job) fails on a ref under the product's namespaces whose kind ref-kinds.constant.ts does not list: work, publication, retired, claims and reservations, land batches, train and culprit markers, rehearsal, unit worktrees."

### S5b — The branch flow, part 2: events and land's upkeep run the reconciler
- **Status**: pending
- **DependsOn**: [S5]
- **Files**: `new:packages/core/src/lib/ref-reconciler/reconciler-run.service.ts`, `new:packages/core/tests/src/lib/ref-reconciler/reconciler-run.service.spec.ts`, `packages/core/src/lib/work-units/work-unit-retire.service.ts`, `packages/core/src/lib/work-units/work-unit-publish.service.ts`, `tools/scripts/host/integration-follow-ups.script.ts`, `new:tools/scripts/forge/reconcile-refs.script.ts`, `new:tools/scripts/forge/reconcile-refs.script.spec.ts`, `.github/workflows/land.yml`
- **Gate**: type
- **Decisions**: none
- acceptance:
  - "reconciler-run.service.spec.ts: a land merge, a pull request closing, `work retire` and `work deliver` each run exactly one reconciler pass."
  - "land.yml's upkeep runs the reconciler as its periodic safety pass, and `lint:ref-lifecycle -- --reap` and close-unpublished-prs leave the upkeep; `bun run lint:workflows` passes."
  - "reconcile-refs.script.spec.ts: the script maps IRefForge onto gh and git, reusing the exported helpers of ref-lifecycle-guard.script.ts, and land.yml's upkeep calls it."

### S5c — The branch flow, part 3: land's pass job runs the reconciler after a merge and on a pull request closing
- **Status**: pending
- **DependsOn**: [S5b]
- **Files**: `packages/core/src/lib/integration/land/land-workflow.helper.ts`, `packages/core/tests/src/lib/integration/land/land-workflow.helper.spec.ts`, `tools/scripts/forge/land-workflow.script.ts`, `tools/scripts/forge/land-workflow.spec.ts`, `.github/workflows/land.yml`
- **Gate**: type
- **Decisions**: none
- **Notes**: Split on 2026-11-18: the original S5c (the four reap modules) is S5k to S5n, one module per slice, because each carries safety rules the reconciler's clone-side adapter must reproduce.
- acceptance:
  - "land-workflow.helper.spec.ts: the generated pass job runs the reconcile script as a step that follows `integration pass` whatever its outcome, so a merge and a closing pull request each settle refs once; `bun tools/scripts/forge/land-workflow.script.ts --check` passes with land.yml regenerated."

### S5k — The branch flow, part 3b: delivered units are ended by the reconciler through a clone-side adapter, and unit-reaper goes
- **Status**: pending
- **DependsOn**: [S5c]
- **Files**: `packages/core/src/lib/ref-reconciler/work-reap.service.ts`, `packages/core/src/cli.ts`, `packages/core/src/lib/ref-reconciler/clone-forge.service.ts`, `packages/core/tests/src/lib/ref-reconciler/clone-forge.service.spec.ts`, `packages/core/tests/src/lib/ref-reconciler/clone-forge-reaped.service.e2e.spec.ts`, `packages/core/tests/src/lib/ref-reconciler/clone-forge-landed.service.e2e.spec.ts`, `packages/core/tests/src/lib/ref-reconciler/clone-forge-edits-kept.service.e2e.spec.ts`
- **Gate**: type
- **Decisions**: none
- acceptance:
  - "clone-forge.service.spec.ts: an IRefForge over a clone reads leases, worktree state, edits-kept and husk rules; an empty clean unit whose owner is inside the 30-minute idle threshold is never ended (x01098 S3), and a unit holding edits or an in-use worktree is kept and reported."
  - "unit-reaper.service.ts and its three specs are deleted, work-unit-reap.service.ts calls the reconciler for delivered units, and `git grep -n reapDeliveredUnits -- packages tools` finds nothing outside packages/core/src/lib/ref-reconciler."

### S5l — The branch flow, part 3c: worktree husks are ended by the reconciler, and worktree-husks goes
- **Status**: pending
- **DependsOn**: [S5k]
- **Files**: `packages/core/src/lib/ref-reconciler/husk-directories.service.ts`, `packages/core/src/lib/contracts/interfaces/husk-directories.interface.ts`, `packages/core/src/lib/ref-reconciler/work-reap.service.ts`, `packages/core/src/lib/work-units/workflow-doctor.service.ts`, `packages/core/tests/src/lib/ref-reconciler/husk-directories.service.e2e.spec.ts`, `packages/core/tests/src/lib/work-units/test-temp-leftovers.service.spec.ts`, `new:packages/core/src/lib/ref-reconciler/clone-forge.service.ts`, `new:packages/core/tests/src/lib/ref-reconciler/clone-forge.service.spec.ts`
- **Gate**: type
- **Decisions**: none
- acceptance:
  - "clone-forge.service.spec.ts adds the husk cases: a husk directory is ended and a stray file inside one is kept, as the husk spec asserted before it was deleted."
  - "reapHusks and keepStrayFiles are defined only under packages/core/src/lib/ref-reconciler; callers import them from there (`git grep -n 'function reapHusks'` finds one definition)."

### S5m — The branch flow, part 3d: stray and rescued refs are retired by the reconciler, and stray-refs-reap goes
- **Status**: pending
- **DependsOn**: [S5l]
- **Files**: `packages/core/src/lib/ref-reconciler/stray-refs-sweep.service.ts`, `packages/core/src/lib/ref-reconciler/stray-refs-sweep.interface.ts`, `packages/core/src/lib/ref-reconciler/stray-ref-retire.service.ts`, `packages/core/src/lib/ref-reconciler/work-reap.service.ts`, `packages/core/tests/src/lib/ref-reconciler/stray-refs-sweep.service.e2e.spec.ts`, `packages/core/tests/src/lib/ref-reconciler/stray-refs-sweep-kept.service.e2e.spec.ts`, `packages/core/tests/src/lib/ref-reconciler/stray-ref-retire.service.e2e.spec.ts`, `packages/core/src/lib/ref-reconciler/desired-state.helper.ts`, `packages/core/tests/src/lib/ref-reconciler/reconciler.service.spec.ts`
- **Gate**: type
- **Decisions**: none
- acceptance:
  - "stray-refs-sweep.service.e2e.spec.ts and stray-refs-sweep-kept.service.e2e.spec.ts keep the stray-ref cases under packages/core/tests/src/lib/ref-reconciler: a stranded or rescued ref goes only when the forge or the integration branch holds what it carries, otherwise it is kept and reported."
  - "reapStrayRefs, retireStrayRef and heldByForge are defined only under packages/core/src/lib/ref-reconciler; callers import them from there (`git grep -n 'function reapStrayRefs\|function heldByForge'` finds one definition each)."

### S5n — The branch flow, part 3e: retired machinery is reaped by the reconciler, and retired-machinery-reap and work-unit-reap go
- **Status**: pending
- **DependsOn**: [S5m]
- **Files**: `packages/core/src/lib/ref-reconciler/retired-machinery-sweep.service.ts`, `packages/core/src/lib/contracts/interfaces/retired-machinery-sweep.interface.ts`, `packages/core/src/lib/ref-reconciler/work-reap.service.ts`, `packages/core/src/lib/work-units/work-unit.service.ts`, `packages/core/src/cli.ts`, `packages/core/tests/src/lib/ref-reconciler/retired-machinery-sweep.service.e2e.spec.ts`, `packages/core/tests/src/lib/ref-reconciler/work-reap.service.e2e.spec.ts`
- **Gate**: type
- **Decisions**: none
- acceptance:
  - "work-reap.service.e2e.spec.ts runs `work reap` from packages/core/src/lib/ref-reconciler and passes; the lefthook post-merge hook still reaches it."
  - "reaped and reapRetiredMachinery are defined only under packages/core/src/lib/ref-reconciler, work-unit.service.ts imports reaped from there, and `git grep -n 'function reapRetiredMachinery\|const reaped ' -- packages` finds one definition each."

### S5d — The branch flow, part 4: hydration, finished-unit ending and the guard's --reap go
- **Status**: pending
- **DependsOn**: [S5n]
- **Files**: `packages/core/src/lib/ref-reconciler/kept-unit-hydration.service.ts`, `packages/core/src/lib/ref-reconciler/finished-units-end.service.ts`, `packages/core/src/lib/work-units/work-unit-enter.service.ts`, `packages/core/src/lib/startup-gate/start-checkout-hydration.ts`, `tools/scripts/lint/ref-lifecycle-guard.script.ts`, `tools/scripts/lint/ref-lifecycle-guard.script.spec.ts`, `lefthook.yml`
- **Gate**: type
- **Decisions**: none
- acceptance:
  - "`git grep -n 'endFinishedUnits\\|hydrateKeptUnits\\|reenteredUnit' -- packages tools` finds nothing outside packages/core/src/lib/ref-reconciler; work-unit-enter creates refs only through the reconciler."
  - "ref-lifecycle-guard.script.spec.ts: the guard only reports; it has no --reap path."

### S5e — The branch flow, part 5: a proposal whose every slice is approved closes in one reconciler step
- **Status**: pending
- **DependsOn**: [S5d]
- **Files**: `new:packages/core/src/lib/ref-reconciler/proposal-close.step.ts`, `new:packages/core/tests/src/lib/ref-reconciler/proposal-close.step.spec.ts`, `tools/scripts/proposals/close-approved-proposals.script.ts`, `tools/scripts/proposals/close-approved-proposals.script.spec.ts`, `tools/scripts/forge/certify-integration.script.ts`
- **Gate**: type
- **Decisions**: none
- acceptance:
  - "proposal-close.step.spec.ts: after a merge, a proposal whose every slice is approved closes in one deterministic step with no agent and no review unit (f00782 sat in review with every slice approved)."
  - "close-approved-proposals.script.ts and its spec are deleted, `git grep -n close-approved-proposals` is empty, and certification is read from the forge by the decisions module, not from a log the owner machine writes."

### S5f — The branch flow, part 6: a draft pull request opens at enter, deliver marks it ready, CI skips drafts
- **Status**: pending
- **DependsOn**: [S5e]
- **Files**: `packages/core/src/lib/work-units/work-unit-enter.service.ts`, `packages/core/src/lib/work-units/work-unit-publish.service.ts`, `packages/core/src/lib/work-units/work-claim.service.ts`, `packages/core/tests/src/lib/work-units/work-unit-enter.service.spec.ts`, `.github/workflows/ci.yml`
- **Gate**: type
- **Decisions**: none
- acceptance:
  - "work-unit-enter.service.spec.ts asserts a draft pull request exists after enter; a deliver case asserts it is marked ready; claim opens no new pull request."
  - "`git grep -n "draft" .github/workflows/ci.yml` shows ci.yml skipping draft pull requests; a large proposal lands as sequential pull requests, never stacked."

### S5g — The branch flow, part 7: the publication path is deleted
- **Status**: pending
- **DependsOn**: [S5f]
- **Files**: `packages/core/src/lib/work-units/publication-pull-request.service.ts`, `tools/scripts/forge/publish-candidate.script.ts`, `tools/scripts/forge/publish-cleanup.ts`, `tools/scripts/forge/open-publication-prs.script.ts`, `tools/scripts/forge/close-unpublished-prs.script.ts`, `package.json`, `packages/core/src/cli.ts`, `packages/cli/src/index.ts`
- **Gate**: type
- **Decisions**: none
- acceptance:
  - "`git grep -n 'forge:publish\\|open-publication-prs\\|publish-candidate' -- packages tools .github package.json lefthook.yml` is empty: no pr/ ref, publication ref, checkout publishing cadence or ref-maintenance re-push exists."
  - "`bun run typecheck` passes with the modules and their specs deleted."

### S5h — The branch flow, part 8: units and refs in the old layout are migrated by a command
- **Status**: pending
- **DependsOn**: [S5g]
- **Files**: `new:packages/core/src/lib/work-units/work-migrate-layout.service.ts`, `new:packages/core/tests/src/lib/work-units/work-migrate-layout.service.spec.ts`, `packages/core/src/lib/work-units/namespace-rename.service.ts`, `packages/cli/src/commands/work.command.ts`
- **Gate**: type
- **Decisions**: none
- acceptance:
  - "work-migrate-layout.service.spec.ts, over a fake forge, migrates old-layout units (publication refs, train refs, review units) and a second run changes nothing; no ref with an open pull request is renamed."
  - "`delendai work migrate --plan` lists what would change and writes nothing."

### S5i — The branch flow, part 9: the retired train prefix leaves the guard and the forge ruleset
- **Status**: pending
- **DependsOn**: [S5h]
- **Files**: `packages/core/src/lib/integration/decisions/namespaces.helper.ts`, `.github/branch-protection.ts`, `tools/scripts/governance/forge-settings.lib.ts`, `tools/scripts/governance/forge-settings.lib.spec.ts`, `tools/scripts/lint/namespace-ruleset-guard.script.ts`, `tools/scripts/forge/train-assembly.ts`
- **Gate**: type
- **Decisions**: none
- acceptance:
  - "forge-settings.lib.spec.ts asserts no `train/` pattern in `policyNamespaces` or `allowedRefPatterns`; train-assembly.ts is deleted; the migration of S5h ran first, so no live ref is rejected."
  - "`bun run lint:namespace-ruleset` passes against the live ruleset, applied in the same change."

### S5j — The branch flow, part 10: work status shows what is under test, what waits and why, and what landed
- **Status**: pending
- **DependsOn**: [S5i]
- **Files**: `packages/core/src/lib/work-units/work-unit-status.service.ts`, `new:packages/core/src/lib/ref-reconciler/status-view.helper.ts`, `new:packages/core/tests/src/lib/ref-reconciler/status-view.helper.spec.ts`
- **Gate**: type
- **Decisions**: none
- acceptance:
  - "status-view.helper.spec.ts, over the fake forge, renders three groups: under test, waiting (with the reason), landed; `delendai work status` prints them."
### S6 — Transition commits folded
- **Status**: pending
- **DependsOn**: [S5]
- **Files**: `packages/core/src/lib/work-units/work-unit-land.service.ts`
- **Gate**: none
- acceptance:
  - "A proposal transition rides in the slice commit that causes it; regeneration rides in the batch commit"

### S7 — Weekly KPIs
- **Status**: pending
- **DependsOn**: [S6]
- **Files**: `tools/scripts/ci/pr-ci-cost.script.ts`, `tools/scripts/ci/pr-ci-cost.interface.ts`, `tools/scripts/ci/pr-ci-cost.script.spec.ts`
- **Gate**: none
- acceptance:
  - "`bun run ci:cost -- --weekly` reports per week ready-to-merged p50, human merges, unexplained waits over 30 minutes and the bookkeeping commit share (targets: 0 human merges, 0 waits, under 10%), proved by tools/scripts/ci/pr-ci-cost.script.spec.ts"
  - "A KPI over its threshold is shown by name with the number, not hidden"

## acceptance

- The inventory lists every actor of the current mechanism with a verdict, a named owner for each KEEP
- One decisions module in core is read by land, work status, the guard, the ruleset generator, the lints and the extension, and a lint refuses any other module that computes those decisions
- land is the only actor that merges, with concurrency 1, no state of its own, and no LLM
- The cutover deletes every replaced workflow, script and host cadence in one change, and a spec proves nothing references them
- A process with an older integration-protocol version refuses to move refs or PRs
- The fake-forge spec and the integration rehearsal pass before anything is deleted
- A unit has one branch and one PR, a draft from work enter and ready from work deliver, and its old layout is migrated by a command shipped in the same change
- A proposal transition rides in the slice commit and regeneration in the batch commit
- Weekly KPIs report ready to merged p50, human merges, unexplained waits over 30 minutes and bookkeeping share, each over-threshold one by name
