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

### S5 — The branch flow: one reconciler, one branch per unit, draft PRs, with its migration
- **Status**: pending
- **DependsOn**: [S4]
- **Files**: `tools/scripts/forge/publish-candidate.script.ts`
- **Gate**: none
- **Notes**: the owner, 2026-11-10: stray branches keep piling up in history and must be handled automatically, never by an agent's decision. S4 deleted the train and hydration mechanisms; S5 replaces every remaining actor on refs, branches and worktrees with one reconciler.
- acceptance:
  - "One source of truth: the unit registry plus the forge. One core reconciler derives the desired state of every ref, branch and worktree, local and remote, from them and converges to it: a unit's branch, worktree and draft pull request are created at work enter; updated or rehydrated (fast-forwarded when it holds nothing of its own, reported when it holds work) when the integration branch moves; deleted, with the tip kept under the retired namespace, when the work lands, its pull request closes or the unit is retired"
  - "Event-driven: land's merges, a pull request closing, work retire and work deliver run the reconciler, and a periodic safety pass (land's upkeep) catches what an event missed. No agent ever deletes, re-pushes or refreshes a ref by hand, and no other module does: work-unit-enter's ref creation, endFinishedUnits on the host follower, work reap (unit-reaper, worktree-husks, stray refs, retired machinery), ref-lifecycle-guard --reap, kept-unit-hydration and close-approved-proposals' own units are folded into it or deleted"
  - "Idempotent and safe: a pass run twice changes nothing the second time, and no pass deletes a commit that exists nowhere else (not in the integration branch, a work, publication or retired ref); such a ref is kept and reported. A spec over the fake forge covers every transition, and a rehearsal runs the reconciler in a throwaway clone and asserts the shared clone gains no ref or worktree"
  - "Every kind of ref the product writes is covered: work (wip), publication (pr) until it goes, retired, claims and reservations, land's batches, the retired queue's trains and culprit markers, rehearsal refs, and the unit worktrees. A ref kind under the product's namespaces that the reconciler does not know fails a lint"
  - "Empty units end: a unit whose branch holds nothing of its own and whose worktree is clean (a review pack's spent generations, g14 and g15 of 2026-11-10) is retired by the reconciler, never left on disk"
  - "A proposal whose every slice is approved closes in one deterministic reconciler step after a merge, with no agent involved (f00782 sat in review with every slice approved); close-approved-proposals and its review units go"
  - "The host follower's other follow-ups settle here: certification is read from the forge by the decisions module instead of a log the owner machine writes, and open-publication-prs goes with the publication path"
  - "The retired train prefix (`<ns>/train/`) leaves the guard and the forge ruleset (`policyNamespaces`, `allowedRefPatterns`), and the live ruleset is applied in the same change: S4 kept admitting it so the old queue worked until the cutover landed, and nothing pushes train refs after it"
  - "Generic and policy-driven: namespaces, branches, retirement and the safety cadence come from development.branches and development.integration; nothing names this repository"
  - "A draft PR opens at work enter, CI skips drafts and work deliver marks it ready; no pr/ ref, publication ref, checkout publishing cadence or ref-maintenance re-push exists"
  - "A large proposal lands as sequential PRs, never stacked, and claim opens no new PRs"
  - "Units and refs in the old layout are migrated by a command shipped in the same change, and the same change deletes the publication path the inventory marks DELETED in S5"
  - "work status shows what is under test, what waits and why, and what landed"
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
- **Files**: `tools/scripts/ci/pr-ci-cost.script.ts`
- **Gate**: none
- acceptance:
  - "pr-ci-cost reports weekly: ready to merged p50, human merges = 0, unexplained waits over 30 minutes = 0, bookkeeping commits under 10%"
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
