---
id: x00879
title: "Main carries no code scanning alert"
kind: fix
status: ready
type: proposal
track: security
date: 2026-10-07
---

# x00879 — Main carries no code scanning alert

## goal

Develop reaches main with no open code scanning alert: the 48 alerts open on main (all on code develop still has) are fixed at their cause, and CodeQL analyses develop too so a new one is reported when it is introduced, not after a promotion. Asked by the owner on 2026-10-07 as the condition for promoting develop to main.

## why

The owner promotes develop to main only from a stable point, and main is where GitHub reports code scanning: 48 alerts are open there (3 errors: html built from input, request forgery, command-line injection; 44 warnings; 1 note), every one of them on code develop still carries. CodeQL runs only on pushes and pull requests to main, so develop was last analysed on 2026-09-29 and each alert reached the owner after the code had long landed.

## non-goals

- Dismissing an alert to make the count drop: each one is fixed in the code, or, where the scanner is wrong, dismissed on the forge with the reason a reviewer can check.
- Promoting develop to main: the owner's decision, made once this lands and develop's full run is green.

## slices

- global_gate: none

### S1 — Core writes temporary files and runs commands safely
- **Status**: review
- **Files**: `packages/core/src/lib/shared/atomic-write.ts`, `packages/core/src/lib/shared/with-file-mutex.ts`, `packages/core/src/lib/shared/run-command.ts`, `packages/core/src/lib/services/shell/terminal-probe.service.ts`
- **Gate**: type
- acceptance:
  - "The alerts js/insecure-temporary-file (#420, #166-#169), js/shell-command-injection-from-environment (#269) and js/indirect-command-line-injection (#366) no longer apply to the code: temporary files are created exclusively with restrictive modes, and no command string built from the environment or arguments reaches a shell."
- Triage 2026-10-07 against develop: #420, #166–#169 and #366 are already fixed there — temporary files sit beside their target and are created `wx` with mode 0o600 (`LOCK_FILE_MODE` in the mutex), and the probed shell comes from a fixed list (`launchableShell`). #269 stays: running a caller's command string is `run-command`'s purpose, through an explicit `/bin/bash --noprofile --norc -c` on POSIX; it is dismissed as won't-fix with that reason once develop is analysed.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S2 — Client, extension and dashboard build no markup or request from untrusted input
- **Status**: review
- **Files**: `packages/client/src/node/services/configuration-center.service.ts`, `extensions/vscode/src/dev/settings-panel.ts`, `extensions/vscode/src/dev/pages/configuration-center.ts`, `packages/ui-extension/src/dashboard/render-dashboard.ts`
- **Gate**: type
- acceptance:
  - "The alerts js/prototype-polluting-assignment (#262-#264), js/file-system-race (#265), js/client-side-request-forgery (#74, #75), js/bad-tag-filter (#59, #60), js/incomplete-multi-character-sanitization (#58) and js/html-constructed-from-input (#358-#360) no longer apply."
- Triage 2026-10-07 against develop: #262–#265, #58–#60, #74, #75 and #23 are already fixed there (prototype keys refused before assignment, a handle-based read, DOM parsing instead of tag regexes, a fixed same-origin path with an encoded query). #358–#360 are false positives: every value the dashboard interpolates passes through `escapeHtml` in its builders; dismissed with that reason once develop is analysed.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S3 — Repository scripts are free of the scanner's findings
- **Status**: review
- **Files**: `tools/scripts/lint/llm-attribution-rules.ts`, `tools/scripts/lint/content-integrity.script.ts`, `tools/scripts/lint/style-integrity.script.ts`, `tools/scripts/publish/workspace-deps.ts`, `tools/scripts/ci/local-repro.script.ts`, `tools/scripts/dev/dev.script.ts`, `tools/scripts/ci/verify-develop-health.script.ts`, `tools/scripts/build/stable-manifest.script.ts`, `tools/scripts/ci/pack-smoke.script.ts`, `tools/scripts/compile/build.script.ts`, `apps/web/scripts/fetch-brand-logos.ts`
- **Gate**: type
- acceptance:
  - "Every open alert under tools/scripts and apps/web/scripts (regex anchors and hostname, tag filters, temporary files, command-line injection, stack-trace exposure, file-system races, a missing space) no longer applies."
- Triage 2026-10-07 against develop: all but two are already fixed there (plain host comparison instead of domain regexes, `\b[^>]*>` closing tags, `writeFileAtomic`, an allowlisted repro program, no stack in HTTP responses, read-then-compare writes). #329 is fixed here: `readExistingManifest` reads and catches instead of checking `existsSync` first. #384 is a false positive (a `::warning title=…::` workflow command wants no space after `::`); dismissed with that reason if the analysis of develop still reports it.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S4 — Specs and remaining sources carry no dead or unsafe code
- **Status**: review
- **Files**: `plugins/proposals/src/lib/agents/loop-detector-service.ts`, `plugins/proposals/src/lib/agents/zombie-reconcile.ts`, `plugins/web-fetch/src/lib/services/engine.ts`, `plugins/error-reporting/src/lib/mcp-internal-error.helper.ts`, `packages/client/tests/services/external-mcp/router.spec.ts`, `packages/core/tests/src/lib/capabilities/adversarial.spec.ts`, `packages/core/tests/src/lib/shared/with-file-mutex.spec.ts`, `packages/cli/src/lib/alias/integration.spec.ts`, `plugins/gitlab/tests/src/lib/tools.spec.ts`, `plugins/proposals/tests/src/lib/agents/delivery-verifier.task-queue.spec.ts`, `plugins/usage-tracking/tests/e2e/1000-calls-latency.e2e.spec.ts`, `packages/ui-extension/tests/components/runtime.spec.ts`, `extensions/vscode/src/test/open-auto-agent-selector.spec.ts`
- **Gate**: type
- acceptance:
  - "The useless assignments and expressions, the incompatible comparison, the unneeded defensive code and the specs' file-system races and tag filters the scanner reports no longer apply."
- Triage 2026-10-07 against develop: the useless assignments (#55, #79, #192, #348), the incompatible comparison (#251), the defensive code (#80) and the specs' races (#40, #341, #367) are already fixed there. #276 is fixed here: the type-level check is `expectTypeOf(ctx).not.toHaveProperty('git')` instead of a bare expression under `@ts-expect-error`. #37 is a spec that plants the lock file on purpose to simulate another process; dismissed as used-in-tests.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S5 — Code scanning analyses the integration branch too
- **Status**: review
- **Files**: `.github/workflows/codeql.yml`
- **Gate**: type
- acceptance:
  - "CodeQL runs on pushes to the integration branch and on pull requests into it, not only on the release branch, so an alert is reported when it is introduced and develop reaches main with none open."
- Delivered: CodeQL runs on pushes to develop and main, on pull requests into develop, and on demand; not on pull requests into main, since the push run already analyses a develop → main candidate's commit (`lint:no-duplicate-release-triggers`).
- review-state: in_review
- review-implementer: claude-opus-5-5

### S6 — Code scanning must pass to merge into develop
- **Status**: review
- **Files**: `delendai.config.json`, `.github/branch-protection.yml`, `.github/branch-protection.ts`, `.github/settings.yml`, `tools/scripts/lint/branch-protection-guard.spec.ts`
- **Gate**: type
- acceptance:
  - "`CodeQL` is a required check of the integration branch, beside `delendai-validate`: a pull request that introduces a code scanning alert does not merge, so develop — and what it promotes to main — stays at zero."
- Asked by the owner on 2026-10-07: code scanning is a validation that must always hold, so a feature, a fix or a refactor cannot bring a new alert in. The policy's `integration.requiredChecks` gains `CodeQL` (the check CodeQL reports on a pull request, seen on #903), and `forge-settings --write` projects it into the generated protection files; the live protection is applied through the repository's bootstrap path. Main's required checks are unchanged: CodeQL does not run on pull requests into main (S5 — the push to develop already analyses that commit), so requiring it there would block every promotion, and main only ever receives what develop let through.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S7 — Every certified develop is scanned
- **Status**: review
- **Files**: `.github/workflows/ci.yml`
- **Gate**: type
- acceptance:
  - "Each full run that certifies the integration branch dispatches CodeQL on it, so a merge made by the queue (whose token starts no workflow on push) is analysed all the same."
- Found 2026-10-07 right after #903 landed: S5's push trigger never fired for develop, because the queue merges with the workflow token and a push made with it starts no workflow — the same reason the full run is dispatched after each merge. `release-the-queue`, which already runs once per certified develop tip, now also dispatches `codeql.yml` on develop.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S8 — Remote names, urls and refs never parse as git options
- **Status**: review
- **Files**: `extensions/vscode/src/test/configuration-center-dev-page.spec.ts`, `packages/cli/src/commands/review.command.ts`, `packages/core/src/lib/integration-engine/git-operations.ts`, `packages/core/src/lib/startup-reconciler/git-seam.ts`, `packages/core/src/lib/startup-reconciler/journal-ref.service.ts`, `packages/core/src/lib/startup-reconciler/retired-tips.service.ts`, `packages/core/src/lib/wip-engine/work-checkout-publisher.ts`, `packages/core/src/lib/wip-engine/work-ref-publication.ts`, `packages/core/src/lib/work-units/retired-landed.service.ts`, `packages/core/src/lib/work-units/slice-reservation-reap.service.ts`, `packages/core/src/lib/work-units/slice-reservation.service.ts`, `packages/core/src/lib/work-units/unit-adoption.service.ts`, `packages/core/src/lib/work-units/work-publish.service.ts`, `packages/core/src/lib/work-units/work-retired-drop.service.ts`, `packages/core/src/lib/work-units/work-unit-generation.service.ts`, `packages/core/src/lib/work-units/work-unit-retire.service.ts`, `packages/core/src/lib/work-units/workflow-invariants.service.ts`, `packages/core/src/lib/work-units/worktree-husks.service.ts`, `packages/core/src/lib/workspace-migration/migrators/development-policy-required-checks.ts`, `plugins/commit-policy/src/lib/services/integrated-work-refs.service.ts`, `plugins/commit-policy/src/lib/services/work-ref-checkpoint.service.ts`, `plugins/git/src/lib/tools/write-tools.ts`, `plugins/proposals/src/lib/proposals/proposal-id-sources.ts`, `plugins/proposals/src/lib/services/review-reservation.service.ts`, `plugins/proposals/src/lib/tools/publish-proposal.ts`, `tools/scripts/forge/advance-queue.script.ts`, `tools/scripts/forge/forward-sync-release.script.ts`, `tools/scripts/forge/open-publication-prs.script.ts`, `tools/scripts/forge/publish-candidate.script.ts`, `tools/scripts/forge/queue-acceptance.ts`, `tools/scripts/forge/refresh-candidates.script.ts`, `tools/scripts/forge/sync-with-integration.script.ts`, `tools/scripts/git/ended-reservations.service.ts`, `tools/scripts/git/maintain-ref-namespace.script.ts`, `tools/scripts/git/refresh-candidate-artifacts.script.ts`, `tools/scripts/proposals/close-approved-proposals.script.ts`, `tools/scripts/reclaim/reclaim-local.script.ts`
- **Gate**: type
- acceptance:
  - "Every git ls-remote, fetch and push that passes a remote, url or ref taken from data ends its options with `--` first, so js/second-order-command-line-injection (#422-#434) no longer applies; the aggregate-job pattern is anchored as a whole (#435) and the test page's end-tag filters accept attributes and whitespace (#421)."
- Found 2026-10-07 in the first analysis of develop (15 open alerts once #903 made it scanned). Fixed as a class, not per alert: every such call in core, the CLI, the plugins and the repository scripts, including the git plugin's push tool, whose remote comes from tool input (`--receive-pack=<cmd>` was a first-order injection there).
- review-state: in_review
- review-implementer: claude-opus-5-5

### S9 — The promotion carries its own required check
- **Status**: review
- **Files**: `.github/workflows/ci.yml`, `tools/scripts/lint/no-duplicate-release-triggers.script.ts`, `tools/scripts/lint/no-duplicate-release-triggers.script.spec.ts`
- **Gate**: type
- acceptance:
  - "The workflow that reports a required check of the release branch runs on pull requests into it, so a promotion whose head no push run built still gets that check; the lint that forbade the doubled trigger exempts that workflow and refuses it when it lacks the trigger."
- Found 2026-10-07 on the first promotion after this proposal's fixes (#911): `delendai-validate` and `release-pr-gate` were green on its head, yet the forge kept it BLOCKED with `delendai-validate` "expected". The check came from a dispatched certification run, and the forge counts a check towards a pull request only from that pull request's own runs or a push; the queue's merges, made with the workflow token, start no push run. The rule against running CI on both triggers rested on that push run existing.

### S10 — No dependency carries a known advisory
- **Status**: review
- **Files**: `.github/workflows/ci.yml`, `apps/web/package.json`, `bun.lock`, `config/delendai/advisory-exceptions.json`, `package.json`, `packages/client/package.json`, `packages/core/package.json`, `packages/test-kit/package.json`, `plugins/adaptive-optimizer/package.json`, `plugins/agent-orchestrator/package.json`, `plugins/audit/package.json`, `plugins/auto-agent-selector/package.json`, `plugins/auto-plugin-selector/package.json`, `plugins/cache/package.json`, `plugins/commit-policy/package.json`, `plugins/completion/package.json`, `plugins/context-for-change/package.json`, `plugins/conventions/package.json`, `plugins/deps/package.json`, `plugins/diagram/package.json`, `plugins/docs/package.json`, `plugins/env/package.json`, `plugins/error-reporting/package.json`, `plugins/forge/package.json`, `plugins/framework-knowledge/package.json`, `plugins/git/package.json`, `plugins/i18n/package.json`, `plugins/impact-analysis/package.json`, `plugins/issues-triage/package.json`, `plugins/issues/package.json`, `plugins/link-check/package.json`, `plugins/logs/package.json`, `plugins/memory/package.json`, `plugins/notification/package.json`, `plugins/orchestrator-runner/package.json`, `plugins/perf/package.json`, `plugins/project-health/package.json`, `plugins/prompt-eval/package.json`, `plugins/proposals/package.json`, `plugins/quality-policy/package.json`, `plugins/quality/package.json`, `plugins/rules/package.json`, `plugins/search/package.json`, `plugins/security/package.json`, `plugins/self-learning/package.json`, `plugins/status-marker/package.json`, `plugins/tech-debt/package.json`, `plugins/test-convention/package.json`, `plugins/test-policy/package.json`, `plugins/usage-tracking/package.json`, `plugins/web-fetch/package.json`, `tools/scripts/lint/dependency-advisories.script.spec.ts`, `tools/scripts/lint/dependency-advisories.script.ts`, `.github/dependabot.yml`, `docs/delendai/DEPENDENCY-VERSIONS.md`, `packages/core/src/lib/scaffold/scaffold-host.ts`
- **Gate**: type
- acceptance:
  - "`@modelcontextprotocol/sdk` is 1.31.0 or later everywhere, and every plugin's range excludes the versions GHSA-6qxp-vccf-f47h affects, so a consumer cannot resolve one."
  - "Dependabot updates the `bun` ecosystem, which reads and rewrites `bun.lock`."
  - "`lint:dependency-advisories` runs on every candidate in `lint-security` and fails on any advisory of moderate severity or above in the lockfile, unless it is excepted in `config/delendai/advisory-exceptions.json` with a reason and a review date that has not passed."
- Found 2026-10-07 right after the promotion: Dependabot opened GHSA-6qxp-vccf-f47h on the root and `apps/web` (SDK pinned at 1.30.0), and `bun audit` found 43 advisories in the lockfile, most kept in place by root `overrides` that had pinned versions once patched and since superseded. The overrides now pin the patched versions; braces has no patched release and is excepted until 2026-11-07. Nothing audited the lockfile before a candidate landed.

### S11 — The forward sync's branch is a canonical publication
- **Status**: review
- **Files**: `tools/scripts/forge/forward-sync-release.script.ts`, `tools/scripts/forge/forward-sync-release.script.spec.ts`, `tools/scripts/forge/keep-the-queue-moving.script.spec.ts`, `tools/scripts/git/maintain-ref-namespace.script.spec.ts`
- **Gate**: type
- acceptance:
  - "The branch the forward sync opens has the agent, kind, unit-with-generation and topic segments of every publication (`delendai/pr/delendai/sync/forward-<sha>-g1/carries-the-release-back`), so `work doctor --forge` reports `publications-canonical` as holding while it is open."
- Found 2026-10-07 on the first real forward sync (#913, after the promotion #911): the flat `delendai/pr/forward-sync-<sha>` failed `publications-canonical` and turned two runs of keep-the-queue-moving red while it was open. A branch DelendAI made broke the rule DelendAI holds every agent's branches to; it now has the same shape instead of an exception.

### S12 — A promotion leaves no red run for a setting nobody chose
- **Status**: review
- **Files**: `.github/workflows/pages.yml`
- **Gate**: type
- acceptance:
  - "On a push to main the Pages workflow builds the site in strict mode whether or not GitHub Pages is enabled, and publishes it only when it is; with Pages off it ends green with a notice saying how to enable it."
- Found 2026-10-07 after the promotion: `Pages → build site` failed with "Get Pages site failed: Not Found" because Pages is not enabled on the repository. Enabling it publishes a public site, which is the owner's decision; until then the check the workflow exists for (the strict site build) still runs.

### S13 — The integrated sweep runs off the promotion path
- **Status**: review
- **Files**: `.github/workflows/quality-gate.yml`
- **Gate**: type
- acceptance:
  - "`quality-gate.yml` no longer runs on pull requests into the release branch or in the merge queue; it sweeps the integration branch daily and on request, with a limit it fits in."
- Found 2026-10-07 on the promotion #911, and the same on #641: the workflow was never a required check of `main`, repeated the CI matrix that is required there, and hit its 30-minute limit on every promotion, leaving a red run that blocked nothing. What only it does, running every lint script including ones no workflow wires, is kept as a daily sweep; its last run had found `proposal-already-implemented` failing on twelve slices, recorded for the backlog reconciliation.

## acceptance

- The alerts js/insecure-temporary-file (#420, #166-#169), js/shell-command-injection-from-environment (#269) and js/indirect-command-line-injection (#366) no longer apply to the code: temporary files are created exclusively with restrictive modes, and no command string built from the environment or arguments reaches a shell.
- The alerts js/prototype-polluting-assignment (#262-#264), js/file-system-race (#265), js/client-side-request-forgery (#74, #75), js/bad-tag-filter (#59, #60), js/incomplete-multi-character-sanitization (#58) and js/html-constructed-from-input (#358-#360) no longer apply.
- Every open alert under tools/scripts and apps/web/scripts (regex anchors and hostname, tag filters, temporary files, command-line injection, stack-trace exposure, file-system races, a missing space) no longer applies.
- The useless assignments and expressions, the incompatible comparison, the unneeded defensive code and the specs' file-system races and tag filters the scanner reports no longer apply.
- CodeQL runs on pushes to the integration branch and on pull requests into it, not only on the release branch, so an alert is reported when it is introduced and develop reaches main with none open.
- Every git network call that takes a remote, url or ref from data separates it from the options with `--`, and code scanning on develop reports no open alert.

## notes

Outcome, verified 2026-10-07 after the promotion (#911): code scanning reports no open alert on `main` (analysis of `11854b55b`, 0 results; the previous one, on `0720e8436`, had 48) and none on `develop`. `CodeQL` is a required check of `develop`, every certified `develop` is analysed, and `lint:dependency-advisories` audits the lockfile on every candidate.
