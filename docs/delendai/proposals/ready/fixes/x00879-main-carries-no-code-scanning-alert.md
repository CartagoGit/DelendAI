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
- **Status**: pending
- **Files**: `packages/core/src/lib/shared/atomic-write.ts`, `packages/core/src/lib/shared/with-file-mutex.ts`, `packages/core/src/lib/shared/run-command.ts`, `packages/core/src/lib/services/shell/terminal-probe.service.ts`
- **Gate**: type
- acceptance:
  - "The alerts js/insecure-temporary-file (#420, #166-#169), js/shell-command-injection-from-environment (#269) and js/indirect-command-line-injection (#366) no longer apply to the code: temporary files are created exclusively with restrictive modes, and no command string built from the environment or arguments reaches a shell."

### S2 — Client, extension and dashboard build no markup or request from untrusted input
- **Status**: pending
- **Files**: `packages/client/src/node/services/configuration-center.service.ts`, `extensions/vscode/src/dev/settings-panel.ts`, `extensions/vscode/src/dev/pages/configuration-center.ts`, `packages/ui-extension/src/dashboard/render-dashboard.ts`
- **Gate**: type
- acceptance:
  - "The alerts js/prototype-polluting-assignment (#262-#264), js/file-system-race (#265), js/client-side-request-forgery (#74, #75), js/bad-tag-filter (#59, #60), js/incomplete-multi-character-sanitization (#58) and js/html-constructed-from-input (#358-#360) no longer apply."

### S3 — Repository scripts are free of the scanner's findings
- **Status**: pending
- **Files**: `tools/scripts/lint/llm-attribution-rules.ts`, `tools/scripts/lint/content-integrity.script.ts`, `tools/scripts/lint/style-integrity.script.ts`, `tools/scripts/publish/workspace-deps.ts`, `tools/scripts/ci/local-repro.script.ts`, `tools/scripts/dev/dev.script.ts`, `tools/scripts/ci/verify-develop-health.script.ts`, `tools/scripts/build/stable-manifest.script.ts`, `tools/scripts/ci/pack-smoke.script.ts`, `tools/scripts/compile/build.script.ts`, `apps/web/scripts/fetch-brand-logos.ts`
- **Gate**: type
- acceptance:
  - "Every open alert under tools/scripts and apps/web/scripts (regex anchors and hostname, tag filters, temporary files, command-line injection, stack-trace exposure, file-system races, a missing space) no longer applies."

### S4 — Specs and remaining sources carry no dead or unsafe code
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/agents/loop-detector-service.ts`, `plugins/proposals/src/lib/agents/zombie-reconcile.ts`, `plugins/web-fetch/src/lib/services/engine.ts`, `plugins/error-reporting/src/lib/mcp-internal-error.helper.ts`, `packages/client/tests/services/external-mcp/router.spec.ts`, `packages/core/tests/src/lib/capabilities/adversarial.spec.ts`, `packages/core/tests/src/lib/shared/with-file-mutex.spec.ts`, `packages/cli/src/lib/alias/integration.spec.ts`, `plugins/gitlab/tests/src/lib/tools.spec.ts`, `plugins/proposals/tests/src/lib/agents/delivery-verifier.task-queue.spec.ts`, `plugins/usage-tracking/tests/e2e/1000-calls-latency.e2e.spec.ts`, `packages/ui-extension/tests/components/runtime.spec.ts`, `extensions/vscode/src/test/open-auto-agent-selector.spec.ts`
- **Gate**: type
- acceptance:
  - "The useless assignments and expressions, the incompatible comparison, the unneeded defensive code and the specs' file-system races and tag filters the scanner reports no longer apply."

### S5 — Code scanning analyses the integration branch too
- **Status**: pending
- **Files**: `.github/workflows/codeql.yml`
- **Gate**: type
- acceptance:
  - "CodeQL runs on pushes to the integration branch and on pull requests into it, not only on the release branch, so an alert is reported when it is introduced and develop reaches main with none open."

## acceptance

- The alerts js/insecure-temporary-file (#420, #166-#169), js/shell-command-injection-from-environment (#269) and js/indirect-command-line-injection (#366) no longer apply to the code: temporary files are created exclusively with restrictive modes, and no command string built from the environment or arguments reaches a shell.
- The alerts js/prototype-polluting-assignment (#262-#264), js/file-system-race (#265), js/client-side-request-forgery (#74, #75), js/bad-tag-filter (#59, #60), js/incomplete-multi-character-sanitization (#58) and js/html-constructed-from-input (#358-#360) no longer apply.
- Every open alert under tools/scripts and apps/web/scripts (regex anchors and hostname, tag filters, temporary files, command-line injection, stack-trace exposure, file-system races, a missing space) no longer applies.
- The useless assignments and expressions, the incompatible comparison, the unneeded defensive code and the specs' file-system races and tag filters the scanner reports no longer apply.
- CodeQL runs on pushes to the integration branch and on pull requests into it, not only on the release branch, so an alert is reported when it is introduced and develop reaches main with none open.
