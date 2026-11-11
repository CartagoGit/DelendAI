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

## slices

- global_gate: none

### S1 — Integration paused until the rehearsal is green
- **Status**: pending
- **Files**: `delendai.config.json`, `.github/workflows/land.yml`, `tools/scripts/forge/land-workflow.script.ts`, `tools/scripts/forge/land-cutover.spec.ts`
- **Gate**: none
- acceptance:
  - "develop's policy sets `development.integration.engine` to `none`; the land workflow is not rendered (`land-workflow.script.ts --check` passes with the file absent), and no workflow, schedule or host step merges, labels or pushes a pull request"
  - "Every open pull request is a draft labelled `delendai:paused`; the label, not a file, is the list the activation slice resumes"
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
  - "Scenarios exist for one PR, N non-overlapping, N overlapping, a red batch, a derived-file conflict, an authored conflict, a bot head, develop moving mid-batch, a host offline and the promotion, each with its expected forge outcome and the targets it checks"
  - "Scenarios F1 to F9 reproduce the nine production failures against today's land, rendered unchanged onto the rehearsal branch, and the run against it is red on exactly those"
  - "The known-red list names each red scenario and the slice that fixes it; it may only shrink, and activation requires it empty"
  - "Where today's triggers cannot fire from a non-default branch, the harness dispatches the pass and counts each such wake as a manual step, so F4 shows as red"

### S4 — land moves into the plugin unchanged
- **Status**: pending
- **DependsOn**: [S3]
- **Files**: `packages/core/src/lib/integration/land/land.interface.ts`, `packages/core/src/lib/integration/land/github-land-forge.service.ts`, `packages/core/src/lib/integration/land/land-config.helper.ts`, `packages/core/src/lib/integration/land/land.constant.ts`, `tools/scripts/forge/land.script.ts`, `tools/scripts/forge/land-fake.ts`, `tools/scripts/forge/land.spec.ts`, `tools/scripts/forge/land-git.ts`, `tools/scripts/forge/land-policy.ts`, `tools/scripts/forge/land-derived.constant.ts`, `tools/scripts/forge/land-rehearsal.ts`
- **Gate**: none
- acceptance:
  - "Every module of `packages/core/src/lib/integration/land/`, `tools/scripts/forge/land*.ts`, `bring-forward.script.ts` and `train-assembly.ts` moves to `plugins/integration/src/lib/land/` with its spec, by `git mv`, with no behaviour change; the decisions module and the protocol helper stay in core, which the guard, lints and extension read"
  - "The pass runs as `delendai integration pass`; the section function, the forge adapter and the derived-file command are injected, so nothing in the plugin names this repository"
  - "The fast rehearsal gives the same verdict per scenario before and after the move"

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
- **Files**: `plugins/integration/src/lib/land/land-workflow.helper.ts`, `plugins/integration/src/lib/land/land-follow-ups.helper.ts`, `plugins/integration/src/lib/services/integration-doctor.service.ts`, `.github/workflows/ci.yml`
- **Gate**: none
- acceptance:
  - "Every merge, push, pull request and label the integrator makes uses the token minted from `identity`; `github.token` only reads, and a spec over the rendered workflow refuses any write through it"
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
  - "Budgets come only from CI measurement, with headroom of the larger of 1.5 times and 50 ms over the CI maximum; a budget written from a local run is refused"
  - "An over-budget test fails only a change that touches its spec file; anywhere else it is recorded on the slow-spec issue with the run link, and never makes a batch or the integration branch red"
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
- Every open pull request is a draft labelled `delendai:paused`; the label, not a file, is the list the activation slice resumes
- land-cutover.spec asserts that with engine `none` no workflow, script or host module merges, labels or pushes
- While the engine is `none` the owner merges this plan's own slices; each such merge is listed as a pre-activation manual step in the activation report
- `delendai integration rehearse --mode=fast --scenarios=<ids|all>` creates `<ns>/rehearsal/<run>/integration` from the tip with one setup commit (integrator workflow, fast CI workflow and policy rendered for that branch), opens synthetic pull requests that touch only `rehearsal/**`, and never writes to develop
- Each synthetic pull request carries `rehearsal/<run>/<pr>.json` declaring its result, duration in seconds and sections; the fast CI workflow sleeps that long and concludes as declared
- The report is JSON plus a short text table: per scenario pass or fail with the forge evidence (run ids, event times, label timelines), and each measurable target with its number and threshold
- Cleanup closes every synthetic pull request, deletes every `<ns>/rehearsal/<run>/` branch, the run's labels and any webhook it created, and fails the run if anything is left; a start sweeps leftovers of runs older than two hours
- Every log of every run the rehearsal started is downloaded and scanned for token shapes and secret values; a hit fails the run
- `.github/workflows/rehearsal.yml` is rendered from the plugin's template, runs on demand and on every pull request touching the integration code, concurrency 1, and always reports a status
- The plugin has its logo, publish order entry, build, file roles and contracts like every plugin
- Scenarios exist for one PR, N non-overlapping, N overlapping, a red batch, a derived-file conflict, an authored conflict, a bot head, develop moving mid-batch, a host offline and the promotion, each with its expected forge outcome and the targets it checks
- Scenarios F1 to F9 reproduce the nine production failures against today's land, rendered unchanged onto the rehearsal branch, and the run against it is red on exactly those
- The known-red list names each red scenario and the slice that fixes it; it may only shrink, and activation requires it empty
- Where today's triggers cannot fire from a non-default branch, the harness dispatches the pass and counts each such wake as a manual step, so F4 shows as red
- Every module of `packages/core/src/lib/integration/land/`, `tools/scripts/forge/land*.ts`, `bring-forward.script.ts` and `train-assembly.ts` moves to `plugins/integration/src/lib/land/` with its spec, by `git mv`, with no behaviour change; the decisions module and the protocol helper stay in core, which the guard, lints and extension read
- The pass runs as `delendai integration pass`; the section function, the forge adapter and the derived-file command are injected, so nothing in the plugin names this repository
- The fast rehearsal gives the same verdict per scenario before and after the move
- `development.integration` gains `identity` (`app` with an app-id variable and key secret name, or `pat` with a token secret name), `batching`, `labels` (prefix), `derived` (paths and command), `zones`, `signalWorkflows`, `scanWorkflows`, `watchdog` and `rehearsal` (secret names, scenario set); every value has a schema, a per-profile default and a row in the documented table
- `batchOpener` is removed and old configs migrate by the shipped config migration
- With no block the engine is `none` and nothing of the plugin acts or renders
- Every merge, push, pull request and label the integrator makes uses the token minted from `identity`; `github.token` only reads, and a spec over the rendered workflow refuses any write through it
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
- Budgets come only from CI measurement, with headroom of the larger of 1.5 times and 50 ms over the CI maximum; a budget written from a local run is refused
- An over-budget test fails only a change that touches its spec file; anywhere else it is recorded on the slow-spec issue with the run link, and never makes a batch or the integration branch red
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
