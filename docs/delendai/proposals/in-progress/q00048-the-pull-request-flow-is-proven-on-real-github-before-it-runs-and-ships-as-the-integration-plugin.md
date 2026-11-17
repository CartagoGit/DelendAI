---
id: q00048
title: "The pull request flow is proven on real GitHub before it runs, and ships as the integration plugin"
kind: plan
status: in-progress
type: proposal
track: general
date: 2026-11-11
last-transition-id: df805936-e996-4ffc-b022-1df059269815
last-correlation-id: df805936-e996-4ffc-b022-1df059269815
last-transition-from: review
last-transition-at: 2026-11-17T12:55:06.955Z
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
- **Status**: review
- **Files**: `delendai.config.json`, `tools/scripts/forge/land-workflow.script.ts`, `tools/scripts/forge/land-cutover.e2e.spec.ts`
- **Gate**: none
- acceptance:
  - "develop's policy sets `development.integration.engine` to `none`; the land workflow is not rendered (`land-workflow.script.ts --check` passes with the file absent), and no workflow, schedule or host step merges, labels or pushes a pull request"
  - "Every open pull request except #1904 and #1905 (handled under 'kept, changed or superseded') is a draft labelled `delendai:paused` (on 2026-11-11: #1894, #1895, #1897, #1906, #1907); the label, not a file, is the list the activation slice resumes"
  - "land-cutover.spec asserts that with engine `none` no workflow, script or host module merges, labels or pushes"
  - "While the engine is `none` the owner merges this plan's own slices; each such merge is listed as a pre-activation manual step in the activation report"
- shipped-in: `8e49a547a1f0`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S2 — The rehearsal harness on real GitHub
- **Status**: review
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
- shipped-in: `1fd67e07a1fc`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S3 — Every case and every production failure is a scenario, red where production failed
- **Status**: review
- **DependsOn**: [S2]
- **Files**: `plugins/integration/src/lib/contracts/constants/rehearsal-scenarios.constant.ts`, `plugins/integration/src/lib/contracts/constants/rehearsal-known-red.constant.ts`, `plugins/integration/tests/src/lib/services/rehearsal-scenarios.spec.ts`
- **Gate**: none
- acceptance:
  - "Scenarios exist for one PR, N non-overlapping, N overlapping, a red batch, a derived-file conflict, an authored conflict, a bot head, develop moving mid-batch, a host offline, an automation-opened pull request (F1b, opened by a workflow as the weekly budget calibration does) and the promotion, each with its expected forge outcome and the targets it checks"
  - "Scenarios F1 to F9 reproduce the nine production failures against today's land, rendered unchanged onto the rehearsal branch, and the run against it is red on exactly those"
  - "The known-red list names each red scenario and the slice that fixes it; it may only shrink, and activation requires it empty"
  - "Where today's triggers cannot fire from a non-default branch, the harness dispatches the pass and counts each such wake as a manual step, so F4 shows as red"
- shipped-in: `1fd67e07a1fc`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S4 — `delendai integration pass`: a project that adopts the flow runs the integrator without this repository's tools
- **Status**: review
- **DependsOn**: [S3]
- **Decision (2026-11-14)**: the land workflow does not use `pull_request_target`. Since 2025-12-08 GitHub reads that workflow from the default branch whatever the PR's base, so a land on the integration branch never started on PR events (rehearsal run 43595171791: 15 land runs, all `push`, every scenario timed out), and from 2026-12-02 public repositories without an event policy block it by default. PR events and CI completion wake the land by `workflow_dispatch` at the PR's base ref, sent by `land-signal.yml` and the CI's signal job, which hold only the workflow token with `actions: write`.
- **Decision (2026-11-14)**: the rehearsal proves batches and wakes. (A) The harness reads the integration branch's first-parent commits only as tips. (B) The pass batches when development.integration.batching is overlap, and the rehearsal policy sets it. (C) The overlapping and red-batch pairs change one shared file on different lines, so they overlap whatever the zones. (D) The rehearsal policy lists the derived-conflict file in derived.paths with an empty derived.command. (E) The land workflow has no workflow-level concurrency: each job has its own group (<group> for the pass, <group>-<job> for the others), so a skipped dispatch never displaces a pending pass. (F) The promotion scenario lands one green pull request.
- **Decision (2026-11-14)**: the rehearsal tests its own commit and reaches every case. (G) Each scenario's integration branch is cut from the commit the CLI runs at, or from --base, and the report's tip names it. (H) A declaration may carry a batch verdict: a head with no declaration is a batch and concludes red when a declaration of the run in its tree fails it, so red-batch has two members green alone and a red batch because of a. (I) The rehearsal's land workflow is built from the policy by the one shared function the repository generator uses, so it has the derived jobs. (J) A head nobody built that already holds the tip is closed and reopened by the identity, once per head read from the forge; its green checks then make it ready. (K) The harness reads the runs again until every merged tip has its push run, up to a bounded number of reads.
- **Decision (2026-11-14)**: the land's writes are the identity's alone and its evidence is read right. (M) Every push and fetch the land makes goes through one function that applies the identity's token and refuses to run without one, and every checkout the land workflow renders drops the workflow token (persist-credentials false), so a missed credential fails instead of falling back to a read-only token. (N) The derived-prepare bundle is written to an absolute path resolved against the invoking directory, where the next step reads it. (O) A head nobody built is one pushed by an actor whose pushes start no CI on which none of the required checks reported (a third-party check does not count); the pass records one reason, after the bring-forward, that states its result.
- **Decision (2026-11-14)**: the land runs no client hook, and the rehearsal waits for what it asserts. (P) Every git command of the land runs with core.hooksPath pointing at no directory, so no hook of any hook manager stops the integrator's merges, commits or pushes: hooks guard people and agents, and the required checks judge what the integrator produces. A failed push reports stdout and stderr. (Q) The harness wakes the integrator, and counts the step, only when no workflow run on the scenario's branch or pull request heads is queued or in progress. (R) The bot-head and automation-opened scenarios end by awaiting the merge of the pull request that carries the token-written head or of the token-opened one, so the evidence is read after the reopen.
- **Decision (2026-11-14)**: the land queues per integration branch, and red-batch waits for its last merge. (S) Every job concurrency group of the land workflow ends with the branch the run acts on (github.ref_name: a dispatch is sent at the base ref, a push carries its branch), so one branch never displaces the pending pass of another; the prefix stays the optional concurrencyGroup and cancel-in-progress stays false. This refines (E). (T) The red-batch scenario ends by awaiting the merge of b after the culprit label, so the evidence is read after it.
- **Decision (2026-11-14)**: the rehearsal report is exact. (U) The merge-time targets count only the pull requests their scenario expects merged, read from its merged expectation keys, so a culprit that correctly stays open is not a miss. (V) In run 43638582081 every one of the 16 merged tips had its scan push run on the forge, created 2 to 4 seconds after the push (scenario runs 43638623113 to 43640543514, listed by the rehearsal-scan workflow), so no push was missing: the settle wait in collect ended as soon as any push run of the tip was listed, and the integrator's own push run is listed before the scan run, so the evidence was read before one scan run existed. The wait, the tips-built expectation and the target now share one test for the scan run. (W) The known-red list keeps only host-offline and the real-mode scenario, and the CLI writes its result to stdout in one blocking write before the exit code is set.
- **Decision (2026-11-14)**: real mode runs the project's real CI. (X) The signal job appended to a project workflow is placed from structured levels, not by re-indenting rendered text: levels up to the step item scale with the file's indent unit (the one its jobs use), the keys of a step sit after its dash, their children one unit deeper and a block's continuation two spaces beyond, so codeql.yml (two spaces) parses; a file that already declares the signal job (ci.yml) is left as the project wrote it, and the signal job never lists itself in needs. A spec parses this repository's ci.yml and codeql.yml and a two-space and a four-space fixture as YAML and checks that no job needs itself or an unknown job. (Y) An await's clock advances only while no workflow run is queued or in progress on the scenario's integration branch or its pull requests' heads (the same read the idle wake uses); it fails after its seconds of idleness and after one absolute cap of 45 minutes, in fast and real mode alike. (Z) A spec asserts that the real-mode policy keeps the project's required checks untouched.
- **Files**: `packages/core/src/lib/contracts/interfaces/integration-engine.interface.ts`, `packages/core/src/lib/contracts/constants/integration-options.constant.ts`, `packages/core/src/lib/development-policy/integration-options.ts`, `packages/core/src/lib/development-policy/resolve.interface.ts`, `packages/core/src/lib/plugins/integration-options-schema.constant.ts`, `plugins/integration/src/lib/services/integration-pass.service.ts`, `plugins/integration/src/lib/services/land-project-ports.helper.ts`, `plugins/integration/src/lib/services/land-zones.helper.ts`, `plugins/integration/src/lib/services/land-git.service.ts`, `plugins/integration/src/lib/services/land-train-assembly.helper.ts`, `plugins/integration/src/lib/services/land-bring-forward.helper.ts`, `plugins/integration/src/lib/contracts/interfaces/integration-pass.interface.ts`, `plugins/integration/src/lib/contracts/constants/integration-pass.constant.ts`, `packages/cli/src/commands/integration-pass.command.ts`, `packages/cli/src/commands/integration.command.ts`, `tools/scripts/forge/land.script.ts`, `tools/scripts/forge/land-jobs.script.ts`, `tools/scripts/forge/land-forward.ts`, `tools/scripts/forge/train-assembly.ts`, `tools/scripts/forge/land-workflow.script.ts`, `tools/scripts/forge/land-pass-equivalence.spec.ts`, `delendai.config.json`
- **Gate**: none
- acceptance:
  - "`delendai integration pass` runs one integrator pass: the CLI resolves the policy and the forge CLI and calls one composition function of the integration plugin; the generic integrator stays in core, which plugins and the CLI import and never the reverse"
  - "The composition builds its ports from `development.integration` (`derived`, `zones`, and the optional `commands.jobs` and `commands.normalizeBatch`), each with a default, so a project with no tools of its own needs only configuration; the plugin imports nothing from `tools/`"
  - "`tools/scripts/forge/land.script.ts` is a thin caller of the same function, and a spec with the in-memory forge shows the script and `integration pass` make the same decisions and the same forge calls, in order"
  - "The land workflow renderer emits the command that runs `integration pass`, and the committed file equals the renderer's output; the engine stays `none` and `land.yml` stays absent while integration is paused"
- shipped-in: `8e49a547a1f0`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S5 — The integration options in the policy
- **Status**: review
- **DependsOn**: [S4]
- **Files**: `packages/core/src/lib/development-policy/profiles.ts`, `packages/core/src/lib/development-policy/validate.ts`, `packages/core/src/lib/development-policy/resolve.ts`, `packages/core/src/lib/development-policy/resolve.interface.ts`, `packages/core/schema/delendai.config.schema.json`, `packages/core/src/lib/plugins/development-delivery-schema.constant.ts`, `packages/core/src/lib/contracts/interfaces/integration-engine.interface.ts`
- **Gate**: none
- acceptance:
  - "`development.integration` gains `identity` (`app` with an app-id variable and key secret name, or `pat` with a token secret name), `batching`, `labels` (prefix), `derived` (paths and command), `zones`, `signalWorkflows`, `scanWorkflows`, `watchdog` and `rehearsal` (secret names, scenario set); every value has a schema, a per-profile default and a row in the documented table"
  - "`batchOpener` is removed and old configs migrate by the shipped config migration"
  - "With no block the engine is `none` and nothing of the plugin acts or renders"
- shipped-in: `8e49a547a1f0`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S6 — The integrator acts as an identity the forge builds, woken only by events
- **Status**: review
- **DependsOn**: [S5]
- **Files**: `packages/core/src/lib/integration/land/land-workflow.helper.ts`, `plugins/integration/src/lib/services/integration-doctor.service.ts`, `.github/workflows/ci.yml`
- **Gate**: none
- acceptance:
  - "Every merge, push, pull request and label the integrator makes uses the token minted from `identity`; `github.token` only reads, and a spec over the rendered workflow refuses any write through it. The same rule binds every automation: a lint over `.github/workflows/` refuses a workflow that opens a pull request or pushes a branch with `github.token` (today `test-budget-calibration.yml` of #1906 and the forward sync); each takes the identity's token, or the host role with the person's credentials where a project has no identity. Scenario F1b (an automation-opened pull request, such as the weekly budget calibration) is green: its CI starts and it lands with no step"
  - "The integrator runs on `pull_request_target` (opened, reopened, synchronize, ready_for_review, labeled, unlabeled, converted_to_draft, closed) and `push` on the integration branch, and on `workflow_dispatch` from the CI signal; `workflow_run` and `check_suite` are gone; an hourly watchdog runs on the default branch only, and any action it takes is counted as a missed event"
  - "The pull_request_target job never checks out or runs pull request code with a token; it reads the forge and merges in a throwaway clone that runs no project script"
  - "ci.yml ends with an `integration-signal` job (always, after every job) that dispatches the integrator for its pull request; integration-branch push runs keep only the newest tip; the `scan-the-integration-branch` dispatch job and `land-follow-ups.helper.ts` are deleted; ci.yml accepts a `zones` dispatch input"
  - "`delendai integration doctor` refuses activation when the identity, its secrets or its permissions are missing, and prints the app manifest the owner installs once"
  - "Scenarios F1, F2 and F4 and the one-PR and N-non-overlapping cases are green and leave the known-red list"
- shipped-in: `edd7b73cd055`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S7 — Verdicts are reconciled, never flipped
- **Status**: review
- **DependsOn**: [S6]
- **Files**: `packages/core/src/lib/integration/land/land-verdict.helper.ts`, `packages/core/src/lib/integration/land/land.helper.ts`
- **Gate**: none
- acceptance:
  - "A pass judges every pull request on its fresh read first, then applies the difference between wanted and present labels; nothing is removed before judging"
  - "A label stays while its reason holds for the current head; it goes only in the pass that judges a new head clear; one comment per head and reason"
  - "Every pass prints one reason line for every open pull request"
  - "Scenario F3 is green: across at least three passes the authored-conflict pull request has exactly one `labeled` and no `unlabeled` event until its head changes"
- shipped-in: `edd7b73cd055`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S8 — One CI per overlapping group, and the integrator brings heads forward
- **Status**: review
- **DependsOn**: [S7]
- **Files**: `packages/core/src/lib/integration/land/land-batch-merge.helper.ts`, `packages/core/src/lib/integration/land/land-batch-record.helper.ts`, `packages/core/src/lib/integration/land/land-bring-forward.helper.ts`, `packages/core/src/lib/integration/land/land-batch-assembly.helper.ts`, `packages/core/src/lib/integration/decisions/overlap.helper.ts`, `plugins/integration/src/lib/services/land-bring-forward.helper.ts`
- **Gate**: none
- acceptance:
  - "Each overlapping ready group gets one batch pull request opened by the integrator; its CI is the only run for the group, and no member is updated or re-run on its own"
  - "A green batch merges its members pinned to their heads; if the integration branch moved meanwhile by sections disjoint from the batch the members still merge and the batch footprint is checked equal to the tested tree, otherwise the group is batched once on the new tip"
  - "A red batch labels its culprit with the failing jobs and run link and batches the rest once; the same set is never batched twice on one tip"
  - "A green pull request with no overlap merges in the pass its own CI signal starts and never waits on a group or a red pull request"
  - "A derived-file conflict is resolved in two jobs: a tokenless job merges the integration branch and runs the project's `derived.command`, refusing any change outside `derived.paths`; a second job pushes the result with the identity, without force, and pushes nothing if the head moved"
  - "A head the forge did not build (no run, or `action_required`) is brought forward once by the integrator; a cross-repository head is never built, pushed or batched"
  - "Scenarios F5, N-overlapping, red batch, derived conflict, bot head and develop-moving-mid-batch are green"
- shipped-in: `edd7b73cd055`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S9 — The integration branch is scanned after every merge
- **Status**: review
- **DependsOn**: [S6]
- **Files**: `.github/workflows/codeql.yml`, `tools/scripts/forge/promotion-alerts.script.ts`
- **Gate**: none
- acceptance:
  - "A push to the integration branch, now made by the identity, runs the full scan; runs keep only the newest tip, and every merged commit is covered within 30 minutes by a completed analysis of itself or a descendant"
  - "promotion-alerts gates the promotion on no open alert on the integration branch"
  - "Scenario F9 is green: in fast mode each tip has its push-started scan workflow, in real mode a completed CodeQL analysis"
- shipped-in: `edd7b73cd055`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S10 — Test budgets never block integration by noise
- **Status**: review
- **DependsOn**: [S3]
- **Files**: `tools/scripts/ci/spec-duration-budget.script.ts`, `tools/scripts/ci/declared-test-budget.ts`, `tools/scripts/ci/test-budget-calibration.ts`, `tools/scripts/ci/test-budget-calibrate.script.ts`, `tools/scripts/test/test-load-reference.json`, `packages/test-kit/src/lib/time-budget/time-budget-runner.helper.ts`, `packages/test-kit/src/lib/time-budget/time-budget.helper.ts`, `packages/test-kit/src/lib/time-budget/time-budget-tier.helper.ts`, `packages/test-kit/src/lib/time-budget/load-benchmark.helper.ts`, `vitest.shared.ts`
- **Gate**: none
- acceptance:
  - "Two tiers. A unit spec (any spec that is not `*.e2e.spec.ts` and not under `tests/e2e/`) fails a test only when its real-clock time exceeds 200 ms; a `[<Nms]` in its name is documentation the judge ignores, the lint no longer requires one and refuses one with N over 200 in a unit spec the change touches (rename the spec to `*.e2e.spec.ts` or make it pure). An e2e test declares `[<Nms]`; in a spec file the change touches it fails only when it takes more than N times the larger of its shard's load factors, and in a spec file the change does not touch it is only reported"
  - "The load factor is measured at the start of each shard in `vitest.shared.ts` by a fixed benchmark (fifteen `git --version` spawns and a hundred small files), divided by the one committed reference `tools/scripts/test/test-load-reference.json`, clamped to 1..4, and passed to the workers by environment; an e2e test that runs over `N x` that factor makes its runner measure the same benchmark again right then, is judged against the larger of the two factors, and a failure names both. An e2e test whose spec file the change does not touch (and every test of an integration-branch push run) is only reported in the overrun digest with its time, budget and both factors, never failed; one whose spec file the change touches is judged strictly, and a fresh budget keeps its existing path. `test:budgets:calibrate --from-ci --update` rewrites the reference to the median benchmark of that run's shards; each shard's digest carries its benchmark time"
  - "The calibration writes e2e budgets as the larger of ceil(1.5 x) and 4 ms more than the longest CI time taken to the reference (divided by its shard's load factor), and never writes a budget into a unit spec. Files on the migration list stay exempt as before; the runner corrected by #1906 measures fake-timer tests on the real clock; an over-limit unit test fails only a change that touches its spec file, and is reported otherwise"
  - "A failure names the tier, the limit, the load factor and the measured time"
  - "Scenario F6 is green"
- shipped-in: `1fd67e07a1fc`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S11a — The host does no integration write and tells sessions what they missed
- **Status**: review
- **DependsOn**: [S6]
- **Files**: `tools/scripts/host/integration-follow-ups.script.ts`, `tools/scripts/host/host-server.script.ts`, `tools/scripts/host/forge-event-catch-up.service.ts`, `packages/core/src/lib/forge-events/forge-event-catch-up.service.ts`, `packages/core/src/lib/forge-events/forge-event-cursor.service.ts`, `plugins/github/src/lib/catch-up-source.service.ts`, `plugins/integration/src/lib/contracts/constants/rehearsal-scenarios.constant.ts`
- **Gate**: none
- acceptance:
  - "The host's follow-ups are local only (fetch and fast-forward, the local reconcile); bring-forward and batch opening leave the host, and a spec refuses a forge write in a follow-up: the follow-up receives no forge-writing port"
  - "The follow-up list is read from the checkout at each run, and a process with an older integration protocol refuses every integration action and says to restart"
  - "The host persists the last forge event it delivered per pull request; on connect it asks the forge once for what it missed (merged, failed required check, needs-update, culprit) and delivers each missed notification once to subscribed sessions through the f00814 bridge; a second reconnect with nothing new delivers nothing"
  - "Scenario host-offline is green: one pull request lands while no receiver runs, then a receiver connects and is told of the merge once; the session-notified target reports not measured, and does not fail, while no real-time transport ran"
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S11b — Sessions are told within 10 s p95 through a relay transport
- **Status**: review
- **DependsOn**: [S11a]
- **Files**: none yet
- **Gate**: none
- acceptance:
  - "Sessions are told within 10 s p95 through a relay transport behind the f00814 port; gh webhook forward stays a development transport (one forwarder per repository, unsupported in production per GitHub docs)"
  - "Scenario F7 is green and the session-notified-p95 target is measured"
- **Decision (2026-11-15)**: real-time delivery needs a relay transport; deferred, no service or account is assumed. S11 is split because GitHub documents that gh webhook forward allows one forwarder per repository and is not supported in production. S11a delivers the local-only follow-ups and the offline catch-up; S14 depends on S11a, not on S11b.
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S12 — Real CI timing mode, and the same targets measured in production
- **Status**: review
- **DependsOn**: [S8]
- **Files**: `plugins/integration/src/lib/services/rehearsal-real-ci.service.ts`, `tools/scripts/ci/pr-ci-cost.script.ts`, `plugins/integration/src/lib/services/rehearsal-pool.helper.ts`, `plugins/integration/tests/src/lib/services/rehearsal-pool.spec.ts`, `plugins/integration/src/lib/services/rehearsal-wait.helper.ts`, `plugins/integration/tests/src/lib/services/rehearsal-wait.spec.ts`, `plugins/integration/src/lib/services/rehearsal-scan.helper.ts`, `plugins/integration/tests/src/lib/services/rehearsal-scan.helper.spec.ts`, `plugins/integration/src/lib/services/rehearsal-step.service.ts`, `plugins/integration/tests/src/lib/services/rehearsal-step.service.spec.ts`, `plugins/integration/src/lib/services/rehearsal-report.service.ts`, `plugins/integration/tests/src/lib/services/rehearsal-report.service.spec.ts`, `plugins/integration/src/lib/services/rehearsal.service.ts`, `plugins/integration/src/lib/services/integration-activation.service.ts`, `plugins/integration/tests/src/lib/services/integration-activation.service.spec.ts`, `tools/scripts/lint/pr-head-shape.script.ts`, `tools/scripts/lint/pr-head-shape.script.spec.ts`, `plugins/integration/src/lib/services/rehearsal-log-scan.helper.ts`, `plugins/integration/tests/src/lib/services/rehearsal-log-scan.helper.spec.ts`, `plugins/integration/tests/src/lib/services/rehearsal-real-ci.service.spec.ts`, `plugins/integration/tests/src/lib/services/rehearsal-branch-gating.spec.ts`, `plugins/integration/tests/src/lib/services/rehearsal-wait.helper.spec.ts`, `plugins/integration/tests/src/lib/services/rehearsal-time-budget.spec.ts`, `plugins/integration/src/lib/contracts/constants/rehearsal.constant.ts`, `plugins/integration/src/lib/contracts/interfaces/rehearsal.interface.ts`, `plugins/integration/src/lib/services/rehearsal-setup.helper.ts`, `plugins/integration/tests/src/lib/services/rehearsal-scenarios.spec.ts`, `plugins/integration/tests/src/lib/services/rehearsal.service.spec.ts`, `plugins/integration/tests/src/lib/services/rehearsal-run.service.spec.ts`, `plugins/integration/src/lib/services/rehearsal-github-forge.service.ts`, `plugins/integration/tests/src/lib/services/rehearsal-github-forge.service.spec.ts`, `plugins/integration/src/lib/services/rehearsal-forge-retry.helper.ts`, `plugins/integration/tests/src/lib/services/rehearsal-forge-retry.spec.ts`, `.github/workflows/rehearsal.yml`, `packages/cli/src/commands/integration.command.spec.ts`, `packages/cli/src/commands/integration.command.ts`, `packages/cli/src/contracts/constants/integration-command.constant.ts`, `packages/core/src/cli.ts`, `packages/core/src/lib/integration/land/github-land-forge.service.ts`, `packages/core/src/lib/integration/land/land-signal.helper.ts`, `packages/core/src/lib/integration/land/land-workflow.helper.ts`, `packages/core/tests/src/lib/integration/land/github-land-forge.service.spec.ts`, `packages/core/tests/src/lib/integration/land/land-workflow.helper.spec.ts`, `plugins/integration/src/lib/services/integration-adoption.service.ts`, `plugins/integration/src/lib/services/integration-pass.service.ts`, `plugins/integration/src/lib/services/rehearsal-ci-workflow.helper.ts`, `plugins/integration/src/lib/services/rehearsal-cleanup.service.ts`, `plugins/integration/src/lib/services/rehearsal-dispatch-steps.helper.ts`, `plugins/integration/src/public/index.ts`, `plugins/integration/tests/src/lib/services/integration-pass.service.spec.ts`, `plugins/integration/tests/src/lib/services/rehearsal-cleanup.service.spec.ts`, `packages/core/src/lib/integration/land/land-branch-gone.helper.ts`, `packages/core/tests/src/lib/integration/land/land-signal.helper.spec.ts`, `docs/delendai/PLUGIN-CONFIGURATION-GUIDE.md`, `packages/core/src/lib/contracts/constants/integration-options.constant.ts`, `packages/core/tests/src/lib/development-policy/integration-options.spec.ts`, `plugins/integration/src/lib/contracts/interfaces/rehearsal-evidence.interface.ts`, `plugins/integration/tests/src/lib/services/rehearsal-github-forge-cancel.spec.ts`, `plugins/integration/src/lib/services/rehearsal-budget.helper.ts`, `plugins/integration/src/lib/services/rehearsal-unstarted.helper.ts`, `plugins/integration/src/lib/contracts/interfaces/rehearsal-forge-raw.interface.ts`, `plugins/integration/src/lib/services/rehearsal-forge-run.helper.ts`, `plugins/integration/tests/src/lib/services/rehearsal-unstarted.helper.spec.ts`, `plugins/integration/src/lib/services/rehearsal-idle.helper.ts`, `plugins/integration/tests/src/lib/services/rehearsal-idle.helper.spec.ts`, `plugins/integration/src/lib/services/rehearsal-graphql.helper.ts`, `plugins/integration/tests/src/lib/services/rehearsal-ready-together.spec.ts`, `tools/scripts/forge/land.spec.ts`, `packages/core/src/lib/integration/land/land.interface.ts`, `plugins/integration/src/lib/services/land-rounds.helper.ts`, `plugins/integration/tests/src/lib/services/land-rounds.helper.spec.ts`, `tools/scripts/forge/land-fake.ts`, `plugins/integration/src/lib/services/rehearsal-token.helper.ts`, `plugins/integration/src/lib/contracts/constants/rehearsal-scenarios.constant.ts`, `plugins/integration/tests/src/lib/services/rehearsal-token.helper.spec.ts`, `plugins/integration/README.md`, `plugins/integration/src/lib/services/rehearsal-run.service.ts`, `plugins/integration/tests/src/lib/services/rehearsal-workflow.spec.ts`, `packages/cli/src/commands/integration-rehearsal-groups.command.ts`, `plugins/integration/src/lib/services/rehearsal-groups-workflow.helper.ts`, `plugins/integration/src/lib/services/rehearsal-groups.helper.ts`, `plugins/integration/src/lib/services/rehearsal-merge.service.ts`, `plugins/integration/tests/src/lib/services/rehearsal-groups.helper.spec.ts`, `plugins/integration/tests/src/lib/services/rehearsal-merge.service.spec.ts`, `plugins/integration/AGENT.md`
- **Gate**: none
- acceptance:
  - "`--mode=real` runs the real ci.yml (branch filters rendered for the rehearsal branch) on each synthetic pull request with its declared zones, and the real scan workflows on each tip"
  - "The report and the weekly production KPIs compute every target with the same metric functions and thresholds"
  - "Real mode is green on every scenario and every target"
- **Decision (2026-11-17)**: the rehearsal plays the catalogue in groups, in both modes, so one slow runner step cannot turn a correct run red. Evidence: fast run 43977667208 on bdf48b828 had 10 of 11 scenarios ok and `derived-conflict: merged not reached in 360 s for a`, although the pull request merged 7.7 minutes after it was ready; the time went into land run 43978071870, whose `derived-push` job spent 202 s (normally 18 to 30 s) in `setup-bun-repo`. A real CI run is about 20 jobs and 6 minutes at the median and the account runs about 20 jobs at once, so 11 pull requests at once queue behind each other. Design: (1) the catalogue of a mode is cut in catalogue order into groups of 4 (fast) or 3 (real) by `partitionScenarios`; `--scenarios=all` still means the whole catalogue, `--group=<n>/<total>` plays one group, an out-of-range group exits 2 with the valid range. (2) The workflow has three jobs: `plan` (prints the matrix, the group count and how many play at once), `play` (a matrix over the groups, `fail-fast: false`, `max-parallel` all for fast and 1 for real, the same 45-minute timeout, a run id carrying `-g<n>` so each group has its own root, a final `if: always()` sweep of its own root plus roots older than the job timeout, a partial report artifact `rehearsal-report-<mode>-<n>`) and `report` (`if: always()`, merges the partial reports into the mode report with the same path and artifact name; targets are recomputed from the samples each report carries, p50 and p95 over all merged pull requests, sums and unions for the rest; a missing, unreadable or other-commit group is named and its scenarios are red). (3) Caps come from the budget: with a worker per scenario the worst case of a group is its longest scenario; a scenario spends at most `awaitBudgetSeconds` in all its waits together (fast 1640 s, real 1920 s) and one wait at most `awaitCapSeconds` (fast 820 s, real 960 s, the budget shared by two waits at the cap). The budget spec recomputes both and asserts fast at least 600 s and real at least 900 s. A per-wait cap alone could not reach those minima: a scenario with three waits (red-batch) cannot spend three waits of 900 s inside 45 minutes, so the waits of a scenario share a budget and a later wait gets what is left. Pool concurrency is the group size (the default of 11 is gone; the policy number only lowers it). (4) The land workflow keeps the repository setup in every job: `derived-push` runs `bun tools/scripts/forge/derived-resolve.script.ts --phase=push`, `promote` runs `open-promotion.script.ts` and `forward-sync` runs `forward-sync-release.script.ts`, and each imports the workspace packages, so each needs the install; a spec on the rendered YAML holds this. (5) Real mode plays 9 scenarios (bot-head and automation-opened are fast only), so its groups are 3, 3 and 3.
- **Decision (2026-11-15)**: real mode renders the branch filters by replacing only the project's integration branch name with the rehearsal branch in each trigger list and keeping every other entry, so a list that also names the release branch still does and the project's no-duplicate-release-triggers lint stays green on the rehearsal branch. The project's integration branch name is passed in from its policy, never assumed, and no lint or governance script changes.
- **Decision (2026-11-15)**: the rehearsal tree satisfies the project's lints; none is relaxed. (1) Each scenario may declare the modes it runs in (modes, default both); bot-head and automation-opened, which need the workflow-token workflow, are fast only. Real mode plays only real-capable scenarios and its setup commit does not write rehearsal-token.yml; the activation coverage check requires of each mode's report the ids that run in that mode. (2) The policy option development.integration.rehearsal.setupCommand (string, default empty) is run by a real-mode rehearsal in a temporary worktree of the commit under test with the rehearsal's files written, and every file it changed joins the single setup commit; this repository sets the forge-settings write command, so the generated settings match the rehearsal policy. A failing command fails the scenario before any pull request opens, naming the command. (3) Not implemented: heads under the publication prefix would lose the protection of the rehearsal namespace, which the ref reconciler never reaps (reconcile.service.ts:135-139), and would be read as publications by the reaper (reconcile.service.ts:194-213 and ref-lifecycle-guard.script.ts:625 reap, :654 retire, :199 unit identity), by publication-superseding (superseded-publication.service.ts:234), by orphaned-work and the queue hydrator (orphaned-work.service.ts:154, 258), by finished-units-end (finished-units-end.service.ts:199) and by slice-reservation (slice-reservation.service.ts:234), and would share the unit identity of the real q00048 S12 units; the owner decides how a rehearsal head is shaped. (4) The report names the mode the run used.
- **Decision (2026-11-16, wake)**: the harness wake (close then reopen) acts only on a pull request the forge reports open at that moment; a merged or closed one is not woken and its wait ends by itself, and a close or reopen that fails (422) because it merged in between is reached, while a 422 with it still unmerged stops with the forge's message. Run 43947462486 showed why red-batch reached a wake at all: the pass (workflow land-rehearsal-...-pass, dispatched by the land-signal job on the pull_request event of red-batch-a) took only a, ready one second before b, built and merged it alone as a green batch of one (integration push CI success, no culprit), so the batch never held the red member and a was never labelled; b then got needs-update on the moved shared file. The event that should start the next pass without help (batch CI ending red, then signal, then pass) never fired because no batch was red. Not a product gap: a pass takes the pull requests ready at the instant it reads the forge and a peer made ready a second later goes in the next pass, so this is a fixture race. Fix: the scenarios of one batch (overlapping, red-batch) make their members ready in ONE GraphQL request (forge port readyTogether, one aliased markPullRequestReadyForReview per member, the same gh identity that marks ready today), and only once no run is queued or in progress on the scenario (bounded by the await cap; at the cap the scenario stops naming the open run). The wake in that run is a fixture artefact and not counted as a product defect.
- **Decision (2026-11-16, passes cover arrivals)**: run 43951516443 left two runs the forge never enqueued; 43952394201 was dispatched while a pass was running and nothing came after it, so GitHub can strand a pending run that nothing replaced, and the product must not depend on a pending run ever starting. (A) After each round the land pass asks the land forge client (landRuns: the land workflow runs of the integration branch) whether a run was created since the round began reading and is not completed; if so it runs another round that re-reads the forge from scratch, at most LAND_MAX_ROUNDS (3) per pass, with no sleeping; at the third round it ends normally and says which run it left; a listing that fails ends the pass normally with a note and never fails it. (B) The rehearsal target unstarted-runs fails only on a lost wake: an unstarted run is covered when a run of its workflow on its branch completed successfully after it was created (that pass re-read after it, by A); covered ones are listed with the pass id.
- **Decision (2026-11-16)**: a red required check is decided from the commit's check runs (the required names from the setup, the latest run per name), as branch protection decides it; a workflow run that started no job makes no check run and is pending, never red. Every wait has its own cap from `rehearsal.constant.ts` (await, token, log scan) and a spec proves the caps of the longest scenario path, at the default concurrency, fit inside the job timeout with a margin. The run of 2026-11-16 reached the 45-minute job timeout because the log scan waited for dispatched land runs queued behind the land concurrency group for about 43 minutes, under a cap equal to the job timeout.
- **Decision (2026-11-16)**: dispatched `land` runs that stayed `queued` with no job for 42 to 50 minutes (rehearsal runs 43876593530 and 43888451460: 5 and 7 runs; the 7 later failed on a 404 because the rehearsal had deleted their branch) are a GitHub-side lost enqueue, not a defect of our concurrency layout: such a run answers the cancel call with `409 Cannot cancel a workflow run that has not been queued yet`, keeps the title `land` (its `run-name` is never evaluated), and was created within seconds of its group changing state while a newer run replaced a pending one; GitHub documents only that at most one job or run per group is pending and that a newer one replaces it, and a stuck run was seen with job-level groups and with the workflow-level group below. The pass is serialised by one workflow-level group per kind of run and branch (`land-<kind>-<branch>`, the run named by it), no job holds a group; a signal does not dispatch while a pass for the branch queued or pending less than two minutes ago (a stuck run has no `-pass-` title and so never counts; one in progress never counts; a dispatch with `promote` is never skipped). Because a stuck run cannot be cancelled, a pass woken for a branch that no longer exists ends successfully with a message instead of failing. The rehearsal cleanup cancels queued runs and waits, to the await cap, for those in progress before it deletes a branch; the rehearsal workflow ends with an `if: always()` sweep step (`integration rehearse --sweep`), and every run starts by sweeping the roots older than the job timeout (45 minutes).
- **Decision (2026-11-16, second)**: (1) A run the forge lists as `queued` with zero jobs that answers cancel with `409 has not been queued yet` is `unstarted`: a forge anomaly we do not depend on, because the run GitHub replaced is the one that never started and its replacer ran. The scan lists it by id instead of treating it as an unread log, the cleanup records it instead of hiding the 409, and the new reported target `unstarted-runs` (a run is in a group with the runs of its workflow file id on its branch, because a run that never started keeps the name of the workflow while its replacer carries its `run-name`) never fails a run unless the unstarted run is the newest of its workflow on its branch (nothing replaced it: a lost wake). A run queued with no job for a minute is no longer work in flight for the harness's idle detection, so a stuck run cannot hold the system from ever being idle and the idle wake (a counted manual step) still happens. (2) The await cap is derived, not picked: `planRehearsalBudget` takes the largest cap whose worst case (every step at its cap, Graham's bound over the workers, the log scan and the cleanup wait) stays within 40 of the 45 job minutes, and when that is under 420 s the fewest workers that allow 420 s; the catalogue gives 11 workers and a 423 s cap, and the budget spec recomputes both. (3) The wake no longer converts a pull request to draft: `convertPullRequestToDraft` is refused to the integrator's App token (no logged run shows it ever succeeding: run 43930743355 never reached a wake, and the refused pull request #2419 was open, ready, authored by the same App and labelled needs-update, the state in which the wake is meant to act), so the wake closes and reopens the pull request, the two events the integrator itself makes in its bring-forward and that the signal listens to.
- **Decision (2026-11-16, bot-head)**: run 43958885357 failed bot-head with "the workflow token pushed nothing" although the token run pushed. Cause: the pass merged the pull request at 21:22:01Z (it had been ready since 21:19:50Z), and the token run, which GitHub started at 21:21:57Z, pushed eabbf57 to the already merged branch at 21:22:11Z; the harness read only the open pull request's head, which never changed. Fix: the fixture pushes with the token before the pull request is ready, and the step waits for the token run to conclude (bounded by the token wait, naming the run at the cap) and takes the commit right above the head the label found in the branch history, a fact a later move of the head cannot erase.
- shipped-in: `9d43622e6ae4`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S13 — Another project adopts the plugin with its own validations
- **Status**: review
- **DependsOn**: [S12]
- **Files**: `plugins/integration/src/lib/services/integration-adoption.service.ts`, `plugins/integration/README.md`, `docs/delendai/PLUGIN-CONFIGURATION-GUIDE.md`
- **Gate**: none
- acceptance:
  - "`delendai integration adopt` renders the integrator workflow, the CI signal job and the rehearsal workflow from the policy; validations are the project's own required checks and CI, never delendai's scripts or paths"
  - "A spec renders them for a fixture project (integration branch `main`, its own zones and derived command) and a grep finds no delendai path, script or proposal id beyond the version pin and header"
  - "The README documents the options, the one-time identity setup and how to run the rehearsal; q00047's integration part (S1, S2 for land) is delivered here"
- shipped-in: `ccbd2639c82f`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S14 — Activation and resume
- **Status**: review
- **DependsOn**: [S8, S9, S10, S11a, S12, S13]
- **Files**: `plugins/integration/src/lib/services/integration-activation.service.ts`, `plugins/integration/tests/src/lib/services/integration-activation.service.spec.ts`
- **Gate**: none
- acceptance:
  - "`delendai integration activate` refuses unless the last fast and real rehearsal reports on develop's tip are green on every scenario and target, the known-red list is empty and the doctor is green; it then writes `engine: land` in delendai.config.json and renders the workflow in one commit"
  - "After that commit merges, `delendai integration resume` marks every `delendai:paused` pull request ready and removes the label; the integrator lands them with no further step"
  - "`delendai integration deactivate` returns to engine `none` in one command, and the first week's KPIs are reported against every target"
- shipped-in: `ccbd2639c82f`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

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
