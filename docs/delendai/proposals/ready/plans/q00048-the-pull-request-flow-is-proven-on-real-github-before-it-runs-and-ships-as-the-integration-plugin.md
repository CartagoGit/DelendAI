---
id: q00048
title: "The pull request flow is proven on real GitHub before it runs, and ships as the integration plugin"
kind: plan
status: ready
type: proposal
track: general
date: 2026-11-11
---

# q00048 — The pull request flow is proven on real GitHub before it runs, and ships as the integration plugin

## goal

Every pull request reaches the integration branch with no person acting, by events only, through an integrator whose pushes and merges the forge builds. The whole flow is proven by a scripted rehearsal on real GitHub in this public repository before it is switched on, and it ships as a generic `integration` plugin that any project adopts with its own validations.

## why

Owner decision of 2026-11-11, after a week and a half of production failures: stop patching land in production; prove the whole flow on real GitHub first, with open pull requests paused as drafts until then; package it as a plugin. Nine failures reached production because the fake-forge spec and the clone rehearsal of q00046 cannot see what only GitHub does: which identity starts workflows, which triggers fire from which branch's file, and how labels and events interleave.

## non-goals

- No code in this proposal; each slice is its own change.
- No new forge feature beyond the q00046 adapter calls plus workflow dispatch and a GitHub App or PAT token.
- The promotion and release steps keep their triggers; only their dependence on the integrator's identity changes.
- The reconciler of refs and units stays q00046 S5; the issue mirror stays q00047 S5.

## architecture

### The two root causes, and the decision

Every one of the nine production failures came from one of two causes:

- **The integrator acted as the workflow token.** GitHub starts no workflow for anything that token pushes or merges. That caused F1 (heads stuck at `action_required`), F2 (no CI, no next pass and no scan after a merge), F5 (no batches, because a batch the token pushed is never built) and F9 (develop not scanned). It also forced work onto the host, where F4 and F7 happened.
- **Nothing was proven on real GitHub.** The fake forge cannot show which identity starts workflows, which triggers fire from which branch's workflow file, or how labels and events interleave (F3, F4). It also cannot show what CI's runners measure (F6), or whether a session hears anything at all (F8).

The decision (owner, 2026-11-11): the integrator acts as a GitHub App. This repository sets `identity: app`, and the integrator uses the App's installation token. The policy still offers `identity: pat` to a project that cannot install an App. The identity is never the workflow token. With that identity the integrator does every forge write in CI, and the host does no integration write. Each case below is proven on real GitHub before the switch is turned on.

Owner prerequisite, once per project: create the App from the manifest that `delendai integration doctor` prints, install it on the repository, and add its id and key as secrets. The App needs contents, pull requests, issues, actions and workflows write, and checks read. No pull request ever needs a manual step.

### Actors

| Actor | Runs where | Does | Never does |
|---|---|---|---|
| Author (agent) | its unit | `work enter`, commits, `work deliver` (marks the PR ready), resolves an authored conflict | merges, labels, pushes another unit's branch |
| Forge (GitHub) | GitHub | emits events, runs CI and scans, enforces the ruleset | — |
| CI | Actions, PR code, no write token | sectioned checks; its last job `integration-signal` (always) dispatches the integrator | writes to the forge except the dispatch |
| Integrator | Actions, `pull_request_target`/`push`/`workflow_dispatch` on the integration branch's own workflow file, concurrency 1 per integration branch, App token | reads every open PR, judges with the core decisions module, merges pinned to a SHA, opens batches, brings heads forward, reconciles labels | runs PR code while it holds a token; acts on a cross-repository head |
| Host | the owner's machine | follows the integration branch (fetch, fast-forward), delivers forge events to subscribed sessions (f00814) | any forge write for integration |

**Triggers.** The flow runs on events only. The integrator wakes on:

- `pull_request_target` on the integration branch, for the types opened, reopened, synchronize, ready_for_review, labeled, unlabeled, converted_to_draft and closed;
- a `push` to the integration branch;
- a `workflow_dispatch` from CI's signal job.

Each pass re-reads the whole forge, so any event settles every PR. None of these triggers depends on the default branch, so a rehearsal branch runs exactly the production trigger graph. Today's `workflow_run`, `check_suite` and the 15-minute cron are removed.

**Safety fallback.** An hourly watchdog on the default branch runs the same pass. It should never find anything to do: any action it takes is counted as a missed event, opens one issue with the evidence and fails the targets. It is an alarm, not a poll loop.

### The flow, case by case

1. **One PR.**
   - The author runs `work deliver`, and the PR becomes ready.
   - The forge starts CI and an integrator pass. That pass prints "waiting for checks" and acts on nothing.
   - CI ends, and its signal job dispatches the integrator.
   - The pass finds the PR green, with nothing landed since its tested base that overlaps it. It merges the PR pinned to its head SHA, using the App token.
   - The push to the integration branch starts the integration CI, the full scan and the next pass.
   - The host fast-forwards the shared checkout, and the author's session gets `pr.merged`.
2. **N non-overlapping PRs.** Each PR's own CI signal wakes a pass. That pass merges every green PR that has no overlap, so no PR waits on another. The integration-branch runs keep only the newest tip.
3. **N overlapping PRs.**
   - The pass groups ready PRs with the same section function that CI uses.
   - Each group gets one batch PR `<ns>/queue/batch-…` over the tip, opened by the integrator. The forge builds it, because the App pushed it.
   - The batch CI is the only run for the group. Its signal wakes the pass, which merges each member pinned to its head and checks the tree against the tested one.
4. **A red batch.**
   - The culprit is attributed from the failing jobs and specs against each member's footprint. It is labelled `culprit` with the jobs and the run link, and its session is notified.
   - The rest are batched once on the tip. When no single member is to blame, only the members whose footprint meets the failure go on alone.
   - The same set is never batched twice on one tip.
5. **A derived-file conflict.**
   - A tokenless job merges the integration branch into the head in a throwaway clone and runs the project's `derived.command`. It refuses any change outside `derived.paths`.
   - A second job pushes the result with the App token, without force. It pushes nothing if the head moved.
   - The new head is built, and the PR lands by case 1.
6. **An authored conflict.**
   - The integrator labels the PR `needs-update` with the files and the reason, and comments once. The author's session is told within seconds.
   - The author merges the integration branch into the unit and pushes. The `synchronize` event wakes a pass, and CI runs.
   - The pass that judges the new head clear removes the label and merges. Nothing waits for the integration branch to move (this fixes F4).
7. **A bot head.** This is a head that the forge did not build: no run, or a run left at `action_required`.
   - The next pass, woken by any event, brings it forward once with the App token (the integration branch merged in).
   - The new head is built, and the PR lands by case 1.
   - The integrator itself never makes such a head.
8. **Develop moving mid-batch.**
   - If the tip moved only by sections disjoint from the batch, the members still merge. The batch footprint is checked equal to the tested tree.
   - If the move overlaps the batch, the group is batched once on the new tip, and the stale batch is closed with the reason.
9. **A host offline.** Integration finishes without the host. When the host reconnects, it asks the forge once (f00814), fast-forwards, and delivers each missed notification exactly once.
10. **An automation-opened PR.** Any workflow that opens a pull request or pushes a branch, such as the weekly budget calibration of #1906, the forward sync or the promotion, uses the identity's token, or the host role with the person's credentials where a project has no identity. It never uses the workflow token, and a lint refuses that. The PR is built and lands by case 1.
11. **Promotion.** After a green integration-branch CI, `open-promotion` opens develop to main. A push to main runs the forward sync. Both now run as the App identity, so their PRs and pushes are built.

### Measurable targets

The rehearsal report checks every target per run, and the weekly production KPIs check the same targets. Both use the same metric functions (S12).

| Target | Definition | Threshold |
|---|---|---|
| PR to merged | from `ready_for_review` to `merged_at`, per PR | p50 < 15 min, p95 < 30 min |
| One CI per overlapping group | CI runs started for a group after it forms: the batch run only, no member re-run | exactly 1 |
| Zero manual steps | forge writes on rehearsal or production PRs by any actor other than the integrator identity, the author's unit or the harness acting as author; plus every harness wake and every watchdog action | 0 |
| Session notified | the time between the forge event (`merged_at`, check `completed_at`, label time) and the subscribed session's receipt | p95 < 10 s |
| PR CI wall time | from the `pull_request` run's start to its end, for a PR that does not touch the integration code | < 5 min (PRs that touch it also run the rehearsal: < 20 min) |
| Test time | budgets declared and measured by the corrected runner of #1906 (fake-timer tests timed on the real clock): unit ≤ 200 ms; e2e ≤ 5,000 ms per test, ≤ 60 s per file, ≤ 3 min per e2e shard. A budget the PR sets does not fail its shard; the merge step requires the CI-calibrated value | all met, lint-checked, merge-step checked |
| Integration branch scanned | every merged commit is covered within 30 min by a completed full analysis of itself or of a descendant | 100 % |
| Labels stable | a `needs-update`/`culprit` label has exactly 1 `labeled` and 0 `unlabeled` events per head while its reason holds | always |
| Secrets in logs | hits of a token shape or a secret value in any run log | 0 |

### The rehearsal

- **Where.** In this repository, on free runners. Each run creates `<ns>/rehearsal/<run>/integration` from the tip, with one setup commit made by the App. That commit renders the integrator workflow, the fast CI workflow and the policy for that branch: the rehearsal labels are prefixed with the run id, and the rehearsal zones are `rehearsal/sections/*`.
- **Synthetic PRs.** These are `<ns>/rehearsal/<run>/pr-<n>`. They touch only `rehearsal/**` and never reach develop. Each carries `rehearsal/<run>/<pr>.json` with its result, its duration and its sections. The project's derived command for the rehearsal regenerates `rehearsal/<run>/derived.txt`.
- **Fast mode.** CI sleeps for the declared duration and concludes as declared. All scenarios finish in about 20 minutes.
- **Real mode.** CI is the real ci.yml, with its branch filters rendered for the rehearsal branch and the zones dispatched from each declaration. The scan workflows are the real CodeQL. Real mode measures the PR CI wall time and the scan coverage.
- **Scenarios.** Cases 1 to 11 above, plus F1 to F9 and F1b (an automation-opened pull request) as named reproductions. Each scenario is scripted, repeatable and checked against forge evidence (run ids, event times, label timelines, notification receipts). F8 and the host-offline case run a real host process with the f00814 receiver and a subscribed test session.
- **Cleanup.** Every synthetic PR is closed. The run's branches, its prefixed labels and any webhook it created are deleted. If anything is left, the run fails. Each start sweeps the leftovers of runs older than two hours.
- **Secrets.** Every log of every run the rehearsal started is scanned. Tokens are minted per job and never printed.
- **When.** On demand. Fast mode also runs on every PR that touches the integration code (the plugin, the rendered workflows, the decisions module), as a status that always reports. A red rehearsal blocks activation, and on such a PR it blocks the merge.

### The plugin: `integration`

Its boundary is: from a ready PR to a merged commit and a told session. It owns:

- the integrator (land);
- its workflow templates and the CI signal snippet;
- the rehearsal;
- the doctor;
- adoption, activation, pause and resume;
- the KPIs.

It depends on core for the policy block, the decisions module and the protocol. It depends on `forge`, `github` and `gitlab` for the adapter, and on f00814's event port and `notification` for telling sessions. Another project adopts it with these steps:

1. Set the `development.integration` options: its own required checks, zones, derived command, identity and scan workflows.
2. Run `delendai integration adopt`. It renders the integrator workflow, appends the signal job to that project's own CI and renders the rehearsal workflow.
3. Install the App.
4. Run `delendai integration rehearse`.
5. Run `delendai integration activate`.

Nothing of this repository is emitted into the other project.

| Existing code | Goes to |
|---|---|
| `packages/core/src/lib/integration/land/*` | moves to `plugins/integration/src/lib/land/` (S4), except what the guard needs |
| `packages/core/src/lib/integration/decisions/*`, `.../protocol/*` | stays in core (the guard, lints and extension read it) |
| `tools/scripts/forge/land*.ts`, `land-fake.ts`, `land.spec.ts` | moves to the plugin (S4); `land.script.ts` becomes `delendai integration pass` |
| `tools/scripts/forge/bring-forward.script.ts`, `train-assembly.ts` | move to the plugin as `land-bring-forward.helper.ts` and `land-batch-assembly.helper.ts`, and run in CI as the integrator (S8) |
| `tools/scripts/forge/land-rehearsal*.ts` (clone rehearsal) | kept as the offline pre-check of a batch; the GitHub rehearsal is new (S2) |
| `open-batches.script.ts` (#1904) | not merged; the integrator opens batches (S8) |
| `tools/scripts/host/integration-follow-ups.script.ts` | stays on the host, with local steps only (S11) |
| `open-promotion`, `forward-sync-release`, `promotion-alerts` | stay; run as the App identity |

### Activation gating

- S1 sets `engine: none` and pauses every open PR (draft plus `delendai:paused`).
- While the engine is `none`, nothing integrates, and the owner merges this plan's slices.
- `delendai integration activate` (S14) switches the engine to `land` only when both rehearsal modes are green on develop's tip, the known-red list is empty and the doctor is green.
- `resume` then marks the paused PRs ready, and the integrator lands them by the flow above.
- `deactivate` is one command.

### Test-budget enforcement — decided by the owner on 2026-11-11: option (c)

**Evidence.** Tests that do real git or disk I/O fail CI from runner load alone, with their budgets unchanged: 40 ms declared and 99 ms measured, 150 and 170, 162 and 178, 148 and 305. On one day these failures blocked several PRs. The owner's standing rule is: an over-budget test fails CI, budgets are calibrated on CI, and there is no hidden multiplier.

**Options that were weighed.**

- **(a) Keep the rule, and make every I/O test pure** (in-memory git, repo templates, a fake clock).
  - Reliable once it is done: a pure test's time does not depend on runner load.
  - Until every I/O test is converted, each one can block integration on noise. The conversion is large, and a test that must prove real git behaviour cannot be made pure.
- **(b) Two tiers.**
  - The pure unit tier hard-fails over budget: ≤ 200 ms, CI-calibrated, as today.
  - The I/O/e2e tier is calibrated weekly from CI history. It fails only on a clear regression against that history, never on one noisy run.
- **(c) (b), with the I/O tier judged against the shard's own load.**
  - Each run measures its shard's load factor: the median of measured time over calibrated p95, across the shard's I/O tests.
  - An I/O test fails when it is over its budget and its own ratio is more than 1.5 times that load factor.
  - Every run prints the load factor and each ratio, so nothing is a hidden multiplier.

**Decision (owner, 2026-11-11): (c), tiered.** The reliability argument:

- Runner load slows all I/O tests of a shard together. A real regression slows one test against its peers.
- Judging the difference from the peers removes the false reds of the evidence: in each of those cases, every I/O test of the shard was slow together.
- It still fails a real regression in the same run, with no reruns and no waiting for a weekly trend.
- The pure tier keeps the owner's rule unchanged.
- Converting I/O tests to pure ones (a) remains the direction. Each converted test moves into the hard tier, so the softer I/O tier only shrinks.

**The work it needs, owned by S10 unless named otherwise:**

- **c00537 S6:** convert the slowest I/O tests to in-memory git and repo templates. The I/O tier must only shrink.
- **The six baselined git helpers:** give each helper a pure in-memory form, so that the tests using them can join the unit tier, and empty their baseline.
- **The weekly calibration of #1906 (`test-budget-calibration.yml`):** it opens its PR through a built identity. That is the host role with the person's credentials until S6's identity exists, then the identity's token, never the workflow token (F1b). The PR it opens lands by case 1.
- **The load-factor judgement:** it goes in `spec-duration-budget.script.ts`, with its spec, and the report prints the load factor of each shard.


### What is kept, changed or superseded

- **q00046 S1 to S3** (inventory, decisions module, land and its fake-forge spec): kept. The decisions module stays the only place where readiness, overlap, grouping, culprit and landing are decided. The fake-forge spec stays the fast unit proof under the GitHub rehearsal.
- **q00046 S4** (the cutover, on develop): its deletions, the protocol version and the engine switch in the policy are kept. Changed:
  - the triggers (`workflow_run`, `check_suite` and the cron give way to `pull_request_target`, `push` and dispatch);
  - the identity (the workflow token gives way to the App);
  - its acceptance line "the after-merge dispatch job becomes workflow_run triggers" is superseded by S6.

  The design note "who pushes" is superseded: its rule was right for the workflow token, but it moved forge writes onto the host and turned batches off, which caused F4, F5 and F7.
- **q00046 S5 and S6**: unchanged, ordered after S14 of this plan.
- **q00046 S7** (the weekly KPIs): superseded by S12, which measures the same KPIs plus these targets with one set of metric functions.
- **#1904:**
  - the host batch opener (`batchOpener: host`, `open-batches.script.ts`, the host role guard) is superseded and not merged;
  - the label fix (07c9b652d) is kept, and S7 re-lands it under the rehearsal;
  - the two budget calibrations are kept, and S10's rule replaces how they are made.

  The PR is not merged, and it is closed when S8 lands.
- **#1905 (f00814 S1 to S6):** the event port, the normaliser, the outbound receiver, the notification bridge and `forge_await` are kept. They are S11's path for telling sessions, and they stay off by policy until S11's scenarios are green. Its S6 trigger that runs `bring-forward` on the host for label events is superseded: the host does no integration write.
- **q00047:** S1 and S2 are delivered for the integration features by S5 and S13. S3 to S6 are unchanged.
- **c00537 S7 and S10 (#1906):** the corrected runner and the fresh-budget rule of #1906 are kept, and S10 builds on them. The rule "an over-budget test fails on CI" is narrowed by S10 to "it fails the change that touches its spec file". Every over-budget test is still reported, so no budget is dropped. #1906's `test-budget-calibration.yml` opens its weekly PR with the workflow token, which is F1 again; S6's lint refuses it until it takes the identity's token.

## slices

- global_gate: none

### S1 — Integration paused until the rehearsal is green
- **Status**: pending
- **Files**: `delendai.config.json`, `.github/workflows/land.yml`, `tools/scripts/forge/land-workflow.script.ts`, `tools/scripts/forge/land-cutover.spec.ts`
- **Gate**: none
- acceptance:
  - "develop's policy sets `development.integration.engine` to `none`; the land workflow is not rendered (`land-workflow.script.ts --check` passes with the file absent), and no workflow, schedule or host step merges, labels or pushes a pull request"
  - "Every open pull request except #1904 and #1905 (handled under 'kept, changed or superseded') is a draft labelled `delendai:paused` (on 2026-11-11: #1894, #1895, #1897, #1906, #1907); the label, not a file, is the list the activation slice resumes"
  - "land-cutover.spec asserts that with engine `none` no workflow, script or host module merges, labels or pushes"
  - "While the engine is `none` the owner merges this plan's own slices; each such merge is listed as a pre-activation manual step in the activation report"

### S2 — The rehearsal harness on real GitHub
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `plugins/integration/package.json`, `plugins/integration/plugin.manifest.ts`, `plugins/integration/src/index.ts`, `plugins/integration/src/lib/services/rehearsal-run.service.ts`, `plugins/integration/src/lib/services/rehearsal-cleanup.service.ts`, `plugins/integration/src/lib/services/rehearsal-report.service.ts`, `plugins/integration/src/lib/services/rehearsal-ci-workflow.helper.ts`, `plugins/integration/tests/src/lib/services/rehearsal-report.service.spec.ts`, `.github/workflows/rehearsal.yml`
- **Gate**: none
- acceptance:
  - "`delendai integration rehearse --mode=fast --scenarios=<ids|all>` creates `<ns>/rehearsal/<run>/integration` from the tip with one setup commit (integrator workflow, fast CI workflow and policy rendered for that branch), opens synthetic pull requests that touch only `rehearsal/**`, and never writes to develop"
  - "Each synthetic pull request carries `rehearsal/<run>/<pr>.json` declaring its result, duration in seconds and sections; the fast CI workflow sleeps that long and concludes as declared"
  - "The report is JSON plus a short text table: per scenario pass or fail with the forge evidence (run ids, event times, label timelines), and each measurable target with its number and threshold"
  - "Cleanup closes every synthetic pull request, deletes every `<ns>/rehearsal/<run>/` branch, the run's labels and any webhook it created, and fails the run if anything is left; a start sweeps leftovers of runs older than two hours"
  - "Every log of every run the rehearsal started is downloaded and scanned for token shapes and secret values; a hit fails the run"
  - "`.github/workflows/rehearsal.yml` is rendered from the plugin's template, runs on demand and on every pull request touching the integration code, concurrency 1, and always reports a status"
  - "The plugin has its logo, publish order entry, build, file roles and contracts like every plugin"

### S3 — Every case and every production failure is a scenario, red where production failed
- **Status**: pending
- **DependsOn**: [S2]
- **Files**: `plugins/integration/src/lib/contracts/constants/rehearsal-scenarios.constant.ts`, `plugins/integration/src/lib/contracts/constants/rehearsal-known-red.constant.ts`, `plugins/integration/tests/src/lib/services/rehearsal-scenarios.spec.ts`
- **Gate**: none
- acceptance:
  - "Scenarios exist for one PR, N non-overlapping, N overlapping, a red batch, a derived-file conflict, an authored conflict, a bot head, develop moving mid-batch, a host offline, an automation-opened pull request (F1b, opened by a workflow as the weekly budget calibration does) and the promotion, each with its expected forge outcome and the targets it checks"
  - "Scenarios F1 to F9 reproduce the nine production failures against today's land, rendered unchanged onto the rehearsal branch, and the run against it is red on exactly those"
  - "The known-red list names each red scenario and the slice that fixes it; it may only shrink, and activation requires it empty"
  - "Where today's triggers cannot fire from a non-default branch, the harness dispatches the pass and counts each such wake as a manual step, so F4 shows as red"

### S4 — `delendai integration pass`: a project that adopts the flow runs the integrator without this repository's tools
- **Status**: pending
- **DependsOn**: [S3]
- **Files**: `packages/core/src/lib/contracts/interfaces/integration-engine.interface.ts`, `packages/core/src/lib/contracts/constants/integration-options.constant.ts`, `packages/core/src/lib/development-policy/integration-options.ts`, `packages/core/src/lib/development-policy/resolve.interface.ts`, `packages/core/src/lib/plugins/integration-options-schema.constant.ts`, `plugins/integration/src/lib/services/integration-pass.service.ts`, `plugins/integration/src/lib/services/land-project-ports.helper.ts`, `plugins/integration/src/lib/services/land-zones.helper.ts`, `plugins/integration/src/lib/services/land-git.service.ts`, `plugins/integration/src/lib/services/land-train-assembly.helper.ts`, `plugins/integration/src/lib/services/land-bring-forward.helper.ts`, `plugins/integration/src/lib/contracts/interfaces/integration-pass.interface.ts`, `plugins/integration/src/lib/contracts/constants/integration-pass.constant.ts`, `packages/cli/src/commands/integration-pass.command.ts`, `packages/cli/src/commands/integration.command.ts`, `tools/scripts/forge/land.script.ts`, `tools/scripts/forge/land-jobs.script.ts`, `tools/scripts/forge/land-forward.ts`, `tools/scripts/forge/train-assembly.ts`, `tools/scripts/forge/land-workflow.script.ts`, `tools/scripts/forge/land-pass-equivalence.spec.ts`, `delendai.config.json`
- **Gate**: none
- acceptance:
  - "`delendai integration pass` runs one integrator pass: the CLI resolves the policy and the forge CLI and calls one composition function of the integration plugin; the generic integrator stays in core, which plugins and the CLI import and never the reverse"
  - "The composition builds its ports from `development.integration` (`derived`, `zones`, and the optional `commands.jobs` and `commands.normalizeBatch`), each with a default, so a project with no tools of its own needs only configuration; the plugin imports nothing from `tools/`"
  - "`tools/scripts/forge/land.script.ts` is a thin caller of the same function, and a spec with the in-memory forge shows the script and `integration pass` make the same decisions and the same forge calls, in order"
  - "The land workflow renderer emits the command that runs `integration pass`, and the committed file equals the renderer's output; the engine stays `none` and `land.yml` stays absent while integration is paused"

### S5 — The integration options in the policy
- **Status**: pending
- **DependsOn**: [S4]
- **Files**: `packages/core/src/lib/development-policy/profiles.ts`, `packages/core/src/lib/development-policy/validate.ts`, `packages/core/src/lib/development-policy/resolve.ts`, `packages/core/src/lib/development-policy/resolve.interface.ts`, `packages/core/schema/delendai.config.schema.json`, `packages/core/src/lib/plugins/development-delivery-schema.constant.ts`, `packages/core/src/lib/contracts/interfaces/integration-engine.interface.ts`
- **Gate**: none
- acceptance:
  - "`development.integration` gains `identity` (`app` with an app-id variable and key secret name, or `pat` with a token secret name), `batching`, `labels` (prefix), `derived` (paths and command), `zones`, `signalWorkflows`, `scanWorkflows`, `watchdog` and `rehearsal` (secret names, scenario set); every value has a schema, a per-profile default and a row in the documented table"
  - "`batchOpener` is removed and old configs migrate by the shipped config migration"
  - "With no block the engine is `none` and nothing of the plugin acts or renders"

### S6 — The integrator acts as an identity the forge builds, woken only by events
- **Status**: pending
- **DependsOn**: [S5]
- **Files**: `plugins/integration/src/lib/land/land-workflow.helper.ts`, `packages/core/src/lib/integration/land/land-follow-ups.helper.ts`, `plugins/integration/src/lib/services/integration-doctor.service.ts`, `.github/workflows/ci.yml`
- **Gate**: none
- acceptance:
  - "Every merge, push, pull request and label the integrator makes uses the token minted from `identity`; `github.token` only reads, and a spec over the rendered workflow refuses any write through it. The same rule binds every automation: a lint over `.github/workflows/` refuses a workflow that opens a pull request or pushes a branch with `github.token` (today `test-budget-calibration.yml` of #1906 and the forward sync); each takes the identity's token, or the host role with the person's credentials where a project has no identity. Scenario F1b (an automation-opened pull request, such as the weekly budget calibration) is green: its CI starts and it lands with no step"
  - "The integrator runs on `pull_request_target` (opened, reopened, synchronize, ready_for_review, labeled, unlabeled, converted_to_draft, closed) and `push` on the integration branch, and on `workflow_dispatch` from the CI signal; `workflow_run` and `check_suite` are gone; an hourly watchdog runs on the default branch only, and any action it takes is counted as a missed event"
  - "The pull_request_target job never checks out or runs pull request code with a token; it reads the forge and merges in a throwaway clone that runs no project script"
  - "ci.yml ends with an `integration-signal` job (always, after every job) that dispatches the integrator for its pull request; integration-branch push runs keep only the newest tip; the `scan-the-integration-branch` dispatch job and `land-follow-ups.helper.ts` are deleted; ci.yml accepts a `zones` dispatch input"
  - "`delendai integration doctor` refuses activation when the identity, its secrets or its permissions are missing, and prints the app manifest the owner installs once"
  - "Scenarios F1, F2 and F4 and the one-PR and N-non-overlapping cases are green and leave the known-red list"

### S7 — Verdicts are reconciled, never flipped
- **Status**: pending
- **DependsOn**: [S6]
- **Files**: `plugins/integration/src/lib/land/land-verdict.helper.ts`, `plugins/integration/src/lib/land/land.helper.ts`
- **Gate**: none
- acceptance:
  - "A pass judges every pull request on its fresh read first, then applies the difference between wanted and present labels; nothing is removed before judging"
  - "A label stays while its reason holds for the current head; it goes only in the pass that judges a new head clear; one comment per head and reason"
  - "Every pass prints one reason line for every open pull request"
  - "Scenario F3 is green: across at least three passes the authored-conflict pull request has exactly one `labeled` and no `unlabeled` event until its head changes"

### S8 — One CI per overlapping group, and the integrator brings heads forward
- **Status**: pending
- **DependsOn**: [S7]
- **Files**: `plugins/integration/src/lib/land/land-batch-merge.helper.ts`, `plugins/integration/src/lib/land/land-batch-record.helper.ts`, `plugins/integration/src/lib/land/land-bring-forward.helper.ts`, `plugins/integration/src/lib/land/land-batch-assembly.helper.ts`, `packages/core/src/lib/integration/decisions/overlap.helper.ts`
- **Gate**: none
- acceptance:
  - "Each overlapping ready group gets one batch pull request opened by the integrator; its CI is the only run for the group, and no member is updated or re-run on its own"
  - "A green batch merges its members pinned to their heads; if the integration branch moved meanwhile by sections disjoint from the batch the members still merge and the batch footprint is checked equal to the tested tree, otherwise the group is batched once on the new tip"
  - "A red batch labels its culprit with the failing jobs and run link and batches the rest once; the same set is never batched twice on one tip"
  - "A green pull request with no overlap merges in the pass its own CI signal starts and never waits on a group or a red pull request"
  - "A derived-file conflict is resolved in two jobs: a tokenless job merges the integration branch and runs the project's `derived.command`, refusing any change outside `derived.paths`; a second job pushes the result with the identity, without force, and pushes nothing if the head moved"
  - "A head the forge did not build (no run, or `action_required`) is brought forward once by the integrator; a cross-repository head is never built, pushed or batched"
  - "Scenarios F5, N-overlapping, red batch, derived conflict, bot head and develop-moving-mid-batch are green"

### S9 — The integration branch is scanned after every merge
- **Status**: pending
- **DependsOn**: [S6]
- **Files**: `.github/workflows/codeql.yml`, `tools/scripts/forge/promotion-alerts.script.ts`
- **Gate**: none
- acceptance:
  - "A push to the integration branch, now made by the identity, runs the full scan; runs keep only the newest tip, and every merged commit is covered within 30 minutes by a completed analysis of itself or a descendant"
  - "promotion-alerts gates the promotion on no open alert on the integration branch"
  - "Scenario F9 is green: in fast mode each tip has its push-started scan workflow, in real mode a completed CodeQL analysis"

### S10 — Test budgets never block integration by noise
- **Status**: pending
- **DependsOn**: [S3]
- **Files**: `tools/scripts/ci/spec-duration-budget.script.ts`, `packages/test-kit/src/lib/time-budget/time-budget-runner.helper.ts`, `tools/scripts/ci/test-budget-calibrate.script.ts`
- **Gate**: none
- acceptance:
  - "A unit test declares at most 200 ms; only the e2e tier (the project's e2e glob, default `*.e2e.spec.ts`) may declare more, at most 5,000 ms per test, 60 s per file and 3 minutes per e2e shard on CI; a lint refuses anything else"
  - "Times are read by the corrected runner of #1906, which measures fake-timer tests on the real clock (a 5 ms test had read 59 s on the fake clock). Budgets come only from CI measurement, with headroom of the larger of 1.5 times and 50 ms over the CI maximum. Fresh-budget rule: a budget that a pull request sets or changes does not fail that pull request's shard; the integrator's merge step requires it to equal the value calibrated from that pull request's own CI run, and labels the PR `needs-update` with the calibrated value otherwise"
  - "An over-budget test fails only a change that touches its spec file; anywhere else it is recorded on the slow-spec issue with the run link, and never makes a batch or the integration branch red. In the I/O/e2e tier, by the owner's decision of 2026-11-11 (option (c) of 'Test-budget enforcement'), an over-budget test fails only when its ratio to its calibrated p95 exceeds 1.5 times its shard's measured load factor, which every run prints; the weekly calibration opens its pull request through a built identity (the host role until S6's identity, never the workflow token)"
  - "Scenario F6 is green"

### S11 — Sessions are told at once; the host does no integration write
- **Status**: pending
- **DependsOn**: [S6]
- **Files**: `tools/scripts/host/integration-follow-ups.script.ts`, `tools/scripts/host/host-server.script.ts`, `packages/core/src/lib/integration/protocol/integration-protocol.helper.ts`
- **Gate**: none
- acceptance:
  - "The host's follow-ups are local only (fetch and fast-forward, the local reconcile); bring-forward and batch opening leave the host, and a spec refuses a forge write in a follow-up"
  - "The follow-up list is read from the checkout at each run, and a process with an older integration protocol refuses every integration action and says to restart"
  - "A session subscribed to a pull request receives merged, failed check, needs-update and culprit within 10 s p95 of the forge event, through the f00814 port, with no polling"
  - "With the host offline integration completes; on reconnect the host asks the forge once and each missed notification is delivered once"
  - "Scenarios F7, F8 and host-offline are green"

### S12 — Real CI timing mode, and the same targets measured in production
- **Status**: pending
- **DependsOn**: [S8]
- **Files**: `plugins/integration/src/lib/services/rehearsal-real-ci.service.ts`, `tools/scripts/ci/pr-ci-cost.script.ts`
- **Gate**: none
- acceptance:
  - "`--mode=real` runs the real ci.yml (branch filters rendered for the rehearsal branch) on each synthetic pull request with its declared zones, and the real scan workflows on each tip"
  - "The report and the weekly production KPIs compute every target with the same metric functions and thresholds"
  - "Real mode is green on every scenario and every target"

### S13 — Another project adopts the plugin with its own validations
- **Status**: pending
- **DependsOn**: [S12]
- **Files**: `plugins/integration/src/lib/services/integration-adoption.service.ts`, `plugins/integration/README.md`, `docs/delendai/PLUGIN-CONFIGURATION-GUIDE.md`
- **Gate**: none
- acceptance:
  - "`delendai integration adopt` renders the integrator workflow, the CI signal job and the rehearsal workflow from the policy; validations are the project's own required checks and CI, never delendai's scripts or paths"
  - "A spec renders them for a fixture project (integration branch `main`, its own zones and derived command) and a grep finds no delendai path, script or proposal id beyond the version pin and header"
  - "The README documents the options, the one-time identity setup and how to run the rehearsal; q00047's integration part (S1, S2 for land) is delivered here"

### S14 — Activation and resume
- **Status**: pending
- **DependsOn**: [S8, S9, S10, S11, S12, S13]
- **Files**: `plugins/integration/src/lib/services/integration-activation.service.ts`, `plugins/integration/tests/src/lib/services/integration-activation.service.spec.ts`
- **Gate**: none
- acceptance:
  - "`delendai integration activate` refuses unless the last fast and real rehearsal reports on develop's tip are green on every scenario and target, the known-red list is empty and the doctor is green; it then writes `engine: land` in delendai.config.json and renders the workflow in one commit"
  - "After that commit merges, `delendai integration resume` marks every `delendai:paused` pull request ready and removes the label; the integrator lands them with no further step"
  - "`delendai integration deactivate` returns to engine `none` in one command, and the first week's KPIs are reported against every target"

## acceptance

- develop's policy sets `development.integration.engine` to `none`; the land workflow is not rendered (`land-workflow.script.ts --check` passes with the file absent), and no workflow, schedule or host step merges, labels or pushes a pull request
- Every open pull request except #1904 and #1905 (handled under 'kept, changed or superseded') is a draft labelled `delendai:paused` (on 2026-11-11: #1894, #1895, #1897, #1906, #1907); the label, not a file, is the list the activation slice resumes
- land-cutover.spec asserts that with engine `none` no workflow, script or host module merges, labels or pushes
- While the engine is `none` the owner merges this plan's own slices; each such merge is listed as a pre-activation manual step in the activation report
- `delendai integration rehearse --mode=fast --scenarios=<ids|all>` creates `<ns>/rehearsal/<run>/integration` from the tip with one setup commit (integrator workflow, fast CI workflow and policy rendered for that branch), opens synthetic pull requests that touch only `rehearsal/**`, and never writes to develop
- Each synthetic pull request carries `rehearsal/<run>/<pr>.json` declaring its result, duration in seconds and sections; the fast CI workflow sleeps that long and concludes as declared
- The report is JSON plus a short text table: per scenario pass or fail with the forge evidence (run ids, event times, label timelines), and each measurable target with its number and threshold
- Cleanup closes every synthetic pull request, deletes every `<ns>/rehearsal/<run>/` branch, the run's labels and any webhook it created, and fails the run if anything is left; a start sweeps leftovers of runs older than two hours
- Every log of every run the rehearsal started is downloaded and scanned for token shapes and secret values; a hit fails the run
- `.github/workflows/rehearsal.yml` is rendered from the plugin's template, runs on demand and on every pull request touching the integration code, concurrency 1, and always reports a status
- The plugin has its logo, publish order entry, build, file roles and contracts like every plugin
- Scenarios exist for one PR, N non-overlapping, N overlapping, a red batch, a derived-file conflict, an authored conflict, a bot head, develop moving mid-batch, a host offline, an automation-opened pull request (F1b, opened by a workflow as the weekly budget calibration does) and the promotion, each with its expected forge outcome and the targets it checks
- Scenarios F1 to F9 reproduce the nine production failures against today's land, rendered unchanged onto the rehearsal branch, and the run against it is red on exactly those
- The known-red list names each red scenario and the slice that fixes it; it may only shrink, and activation requires it empty
- Where today's triggers cannot fire from a non-default branch, the harness dispatches the pass and counts each such wake as a manual step, so F4 shows as red
- Every module of `packages/core/src/lib/integration/land/`, `tools/scripts/forge/land*.ts`, `bring-forward.script.ts` and `train-assembly.ts` moves to `plugins/integration/src/lib/land/` with its spec, by `git mv`, with no behaviour change (except `land-follow-ups.helper.ts`, which stays until S6 deletes it); the decisions module and the protocol helper stay in core, which the guard, lints and extension read
- The pass runs as `delendai integration pass`; the section function, the forge adapter and the derived-file command are injected, so nothing in the plugin names this repository
- The fast rehearsal gives the same verdict per scenario before and after the move
- `development.integration` gains `identity` (`app` with an app-id variable and key secret name, or `pat` with a token secret name), `batching`, `labels` (prefix), `derived` (paths and command), `zones`, `signalWorkflows`, `scanWorkflows`, `watchdog` and `rehearsal` (secret names, scenario set); every value has a schema, a per-profile default and a row in the documented table
- `batchOpener` is removed and old configs migrate by the shipped config migration
- With no block the engine is `none` and nothing of the plugin acts or renders
- Every merge, push, pull request and label the integrator makes uses the token minted from `identity`; `github.token` only reads, and a spec over the rendered workflow refuses any write through it. The same rule binds every automation: a lint over `.github/workflows/` refuses a workflow that opens a pull request or pushes a branch with `github.token` (today `test-budget-calibration.yml` of #1906 and the forward sync); each takes the identity's token, or the host role with the person's credentials where a project has no identity. Scenario F1b (an automation-opened pull request, such as the weekly budget calibration) is green: its CI starts and it lands with no step
- The integrator runs on `pull_request_target` (opened, reopened, synchronize, ready_for_review, labeled, unlabeled, converted_to_draft, closed) and `push` on the integration branch, and on `workflow_dispatch` from the CI signal; `workflow_run` and `check_suite` are gone; an hourly watchdog runs on the default branch only, and any action it takes is counted as a missed event
- The pull_request_target job never checks out or runs pull request code with a token; it reads the forge and merges in a throwaway clone that runs no project script
- ci.yml ends with an `integration-signal` job (always, after every job) that dispatches the integrator for its pull request; integration-branch push runs keep only the newest tip; the `scan-the-integration-branch` dispatch job and `land-follow-ups.helper.ts` are deleted; ci.yml accepts a `zones` dispatch input
- `delendai integration doctor` refuses activation when the identity, its secrets or its permissions are missing, and prints the app manifest the owner installs once
- Scenarios F1, F2 and F4 and the one-PR and N-non-overlapping cases are green and leave the known-red list
- A pass judges every pull request on its fresh read first, then applies the difference between wanted and present labels; nothing is removed before judging
- A label stays while its reason holds for the current head; it goes only in the pass that judges a new head clear; one comment per head and reason
- Every pass prints one reason line for every open pull request
- Scenario F3 is green: across at least three passes the authored-conflict pull request has exactly one `labeled` and no `unlabeled` event until its head changes
- Each overlapping ready group gets one batch pull request opened by the integrator; its CI is the only run for the group, and no member is updated or re-run on its own
- A green batch merges its members pinned to their heads; if the integration branch moved meanwhile by sections disjoint from the batch the members still merge and the batch footprint is checked equal to the tested tree, otherwise the group is batched once on the new tip
- A red batch labels its culprit with the failing jobs and run link and batches the rest once; the same set is never batched twice on one tip
- A green pull request with no overlap merges in the pass its own CI signal starts and never waits on a group or a red pull request
- A derived-file conflict is resolved in two jobs: a tokenless job merges the integration branch and runs the project's `derived.command`, refusing any change outside `derived.paths`; a second job pushes the result with the identity, without force, and pushes nothing if the head moved
- A head the forge did not build (no run, or `action_required`) is brought forward once by the integrator; a cross-repository head is never built, pushed or batched
- Scenarios F5, N-overlapping, red batch, derived conflict, bot head and develop-moving-mid-batch are green
- A push to the integration branch, now made by the identity, runs the full scan; runs keep only the newest tip, and every merged commit is covered within 30 minutes by a completed analysis of itself or a descendant
- promotion-alerts gates the promotion on no open alert on the integration branch
- Scenario F9 is green: in fast mode each tip has its push-started scan workflow, in real mode a completed CodeQL analysis
- A unit test declares at most 200 ms; only the e2e tier (the project's e2e glob, default `*.e2e.spec.ts`) may declare more, at most 5,000 ms per test, 60 s per file and 3 minutes per e2e shard on CI; a lint refuses anything else
- Times are read by the corrected runner of #1906, which measures fake-timer tests on the real clock (a 5 ms test had read 59 s on the fake clock). Budgets come only from CI measurement, with headroom of the larger of 1.5 times and 50 ms over the CI maximum. Fresh-budget rule: a budget that a pull request sets or changes does not fail that pull request's shard; the integrator's merge step requires it to equal the value calibrated from that pull request's own CI run, and labels the PR `needs-update` with the calibrated value otherwise
- An over-budget test fails only a change that touches its spec file; anywhere else it is recorded on the slow-spec issue with the run link, and never makes a batch or the integration branch red. In the I/O/e2e tier, by the owner's decision of 2026-11-11 (option (c) of 'Test-budget enforcement'), an over-budget test fails only when its ratio to its calibrated p95 exceeds 1.5 times its shard's measured load factor, which every run prints; the weekly calibration opens its pull request through a built identity (the host role until S6's identity, never the workflow token)
- Scenario F6 is green
- The host's follow-ups are local only (fetch and fast-forward, the local reconcile); bring-forward and batch opening leave the host, and a spec refuses a forge write in a follow-up
- The follow-up list is read from the checkout at each run, and a process with an older integration protocol refuses every integration action and says to restart
- A session subscribed to a pull request receives merged, failed check, needs-update and culprit within 10 s p95 of the forge event, through the f00814 port, with no polling
- With the host offline integration completes; on reconnect the host asks the forge once and each missed notification is delivered once
- Scenarios F7, F8 and host-offline are green
- `--mode=real` runs the real ci.yml (branch filters rendered for the rehearsal branch) on each synthetic pull request with its declared zones, and the real scan workflows on each tip
- The report and the weekly production KPIs compute every target with the same metric functions and thresholds
- Real mode is green on every scenario and every target
- `delendai integration adopt` renders the integrator workflow, the CI signal job and the rehearsal workflow from the policy; validations are the project's own required checks and CI, never delendai's scripts or paths
- A spec renders them for a fixture project (integration branch `main`, its own zones and derived command) and a grep finds no delendai path, script or proposal id beyond the version pin and header
- The README documents the options, the one-time identity setup and how to run the rehearsal; q00047's integration part (S1, S2 for land) is delivered here
- `delendai integration activate` refuses unless the last fast and real rehearsal reports on develop's tip are green on every scenario and target, the known-red list is empty and the doctor is green; it then writes `engine: land` in delendai.config.json and renders the workflow in one commit
- After that commit merges, `delendai integration resume` marks every `delendai:paused` pull request ready and removes the label; the integrator lands them with no further step
- `delendai integration deactivate` returns to engine `none` in one command, and the first week's KPIs are reported against every target
