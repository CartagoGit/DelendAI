---
id: x00758
title: "The release carries no new code-scanning alert"
kind: fix
status: in-progress
type: proposal
track: security
date: 2026-09-29
priority: P0
related: []
last-transition-id: c4b96385-df94-4773-b81d-c4ebfc8e60bf
last-correlation-id: c4b96385-df94-4773-b81d-c4ebfc8e60bf
last-transition-from: review
---

# x00758 — The release carries no new code-scanning alert

## goal

The promotion of `develop` into `main` introduces no CodeQL alert, and
`main`'s rule that every conversation is resolved does not block it.

## why

On 2026-09-29 the release pull request (#641) reported 35 new CodeQL
alerts in the code it brings to `main`: 29 high, 3 medium, 3 warnings.
GitHub posts each as a review conversation, and `main` requires every
conversation to be resolved, so the release could not merge, apart from
the risk itself. The previous release fixed its alerts before promoting
(#178); this one does the same, fixing each at its cause rather than
dismissing it.

## why this design

Each alert is fixed where its data enters, and a fix shared by several is
written once:

- **Prototype pollution** (CLI `--options-<plugin>=<k>=<v>`): both levels
  are prototype-less objects, set through one `setExtraOption`, which also
  drops `__proto__`, `prototype` and `constructor`.
- **Second-order command injection** (`git ls-remote` with a remote or ref
  from configuration): `--` before the positional arguments, so a name that
  looks like an option is never read as one.
- **Missing anchors**: the GitHub-remote test anchors the host
  (`evilgithub.com` no longer passes); the secret-name test is written as
  word checks, which is what it meant.
- **ReDoS**: the frontmatter key/value line captures the rest after the
  colon whole (callers trim it); trailing-separator and slash trims are
  loops.
- **Insecure temporary files**: `writeFileAtomic` creates its temporary
  exclusively (`wx`) and private (`0600`), then gives it the final file's
  mode before the rename; the browser plugin's own copy of that writer is
  replaced by the core one; CI artefacts are written `0600`.
- **File-system races**: `readTextIfPresent` and `readRegularFile`
  (`tools/scripts/lib`) read once, through the descriptor that was checked;
  the hooks hardener reads and rewrites through one descriptor; the git
  directory, loose refs and the spec walker read once.
- **Incomplete escaping**: the docs index escapes backslashes before pipes;
  the lint escaping a name for a RegExp escapes every metacharacter; the
  script-dependency resolver replaces every `*`; a trailer's name is what
  precedes the address.
- **Regex injection** (a false reading of `rule.match(path)` as
  `String.prototype.match`): the role-rule predicate is `matches`, as every
  other rule table in the repository already names it.
- **Stack-trace exposure** (dev server): the page gets a fixed message, the
  terminal the error.
- The rest: a useless initial value, and a check that now declares the
  context its type passes.

## non-goals

- Dismissing an alert instead of fixing it. None of the 48 is dismissed.

## Slices

- global_gate: none

### S1 — Fix the 35 alerts the release introduces

- **Status**: in-progress
- **Gate**: `npx vitest run tools/scripts/lib/read-text-if-present.spec.ts packages/cli plugins/conventions`
- **Files**:
  - `packages/cli/src/lib/doctor/checks/stale-docs.check.ts`
  - `packages/cli/src/lib/parser.service.ts`
  - `packages/cli/src/lib/stdio-context.factory.ts`
  - `packages/core/src/lib/contracts/file-conventions.contract.ts`
  - `packages/core/src/lib/shared/atomic-write.ts`
  - `packages/core/src/lib/work-identity/resolve-work-agent.service.ts`
  - `packages/core/src/lib/work-units/publication-pull-request.service.ts`
  - `packages/core/src/lib/work-units/publication-target.service.ts`
  - `packages/core/src/lib/work-units/work-publish.service.ts`
  - `packages/core/tests/src/lib/workspace-migration/legacy-migration-manager.spec.ts`
  - `packages/proposals-sqlite/src/lib/frontmatter-loose.helper.ts`
  - `plugins/browser/src/lib/tools/browser-inspect.tool.ts`
  - `plugins/commit-policy/src/lib/triggers/slice-listener.ts`
  - `plugins/conventions/src/lib/profiles/go.profile.ts`
  - `plugins/conventions/src/lib/profiles/profile.contract.ts`
  - `plugins/conventions/src/lib/profiles/python.profile.ts`
  - `plugins/conventions/src/lib/profiles/rust.profile.ts`
  - `plugins/conventions/src/lib/tools/explain-path.tool.ts`
  - `plugins/proposals/src/lib/services/review-attribution.ts`
  - `plugins/proposals/src/lib/services/review-claims.service.ts`
  - `plugins/proposals/src/lib/tools/db-reconcile.tool.ts`
  - `plugins/proposals/tests/src/lib/tools/db-reconcile.tool.spec.ts`
  - `tools/scripts/ci/affected.script.ts`
  - `tools/scripts/ci/script-dependencies.ts`
  - `tools/scripts/dev/dev.script.ts`
  - `tools/scripts/dev/api/real-data.ts`
  - `packages/core/tests/src/lib/plugin-drift-budget.spec.ts`
  - `tools/scripts/docs/generate-docs-index.script.ts`
  - `tools/scripts/forge/advance-queue.script.ts`
  - `tools/scripts/forge/certify-integration.script.ts`
  - `tools/scripts/git/harden-git-hooks.script.ts`
  - `tools/scripts/git/hydration-lock.ts`
  - `tools/scripts/git/maintain-ref-namespace.script.ts`
  - `tools/scripts/lib/read-text-if-present.spec.ts`
  - `tools/scripts/lib/read-text-if-present.ts`
  - `tools/scripts/lint/detail-levels-coverage.script.ts`
  - `tools/scripts/lint/file-conventions.script.spec.ts`
  - `tools/scripts/migrate/rebrand-propagate.script.ts`
- shipped-in: `f5a6c17ebe6c`
- review-state: changes_requested
- review-implementer: unrecorded
- review-reviewer: minimax-3
- review-log: requested_changes by minimax-3 — El candidato f5a6c17ebe6c no satisface por sí solo la slice. La propia propuesta dice que después del primer merge aún quedaban tres alertas de CodeQL y hubo que cerrarlas en 2c8cdadf0dc7b3c1303d32fc9c955119c57fdbf7; con este candidate hash la aceptación no queda cubierta.
- review-attribution: unrecorded — no delivering commit was named for x00758 S1; independence could not be verified, opened by minimax-3

After the first merge the release's CodeQL still reported three: the
directory `writeFileAtomic` opens to fsync it (now opened `O_RDONLY`, never
created), and two dev-server responses that carried error text (the
bundle failure and the dashboard's errors now tell the page where to look,
and the terminal gets the error). Moving the loose-ref read also changed a
line `plugin-drift-budget` allowlists by text; its entry names the new
line.
- review-state: changes_requested
- review-implementer: unrecorded
- review-reviewer: minimax-3
- review-log: requested_changes by minimax-3 — El candidato f5a6c17ebe6c no satisface por sí solo la slice. La propia propuesta dice que después del primer merge aún quedaban tres alertas de CodeQL y hubo que cerrarlas en 2c8cdadf0dc7b3c1303d32fc9c955119c57fdbf7; con este candidate hash la aceptación no queda cubierta.
- review-attribution: unrecorded — no delivering commit was named for x00758 S1; independence could not be verified, opened by minimax-3

### S2 — Fix the 48 alerts `main` already carried

- **Status**: review
- **Gate**: `npx vitest run packages/ui-extension plugins/proposals/tests/src/lib/agents packages/core/tests/src/lib/services/shell packages/core/tests/src/lib/shared tools/tests/ci/local-repro.spec.ts`
- **Files**:
  - `apps/web/scripts/fetch-brand-logos.ts`
  - `docs/delendai/proposals/review/x00758-the-release-carries-no-new-code-scanning-alert.md`
  - `extensions/vscode/src/dev/pages/configuration-center.ts`
  - `extensions/vscode/src/dev/settings-panel.ts`
  - `extensions/vscode/src/test/open-auto-agent-selector.spec.ts`
  - `packages/cli/src/lib/alias/integration.spec.ts`
  - `packages/client/src/node/services/configuration-center.service.ts`
  - `packages/client/tests/services/external-mcp/router.spec.ts`
  - `packages/core/src/lib/services/shell/terminal-probe.service.ts`
  - `packages/core/src/lib/shared/atomic-write.ts`
  - `packages/core/src/lib/shared/with-file-mutex.ts`
  - `packages/core/tests/src/lib/capabilities/adversarial.spec.ts`
  - `packages/core/tests/src/lib/services/shell/terminal-probe.spec.ts`
  - `packages/core/tests/src/lib/shared/run-command.spec.ts`
  - `packages/core/tests/src/lib/shared/with-file-mutex.spec.ts`
  - `packages/ui-extension/src/configuration-center/render-configuration-center.ts`
  - `packages/ui-extension/src/dashboard/bar-chart.ts`
  - `packages/ui-extension/src/dashboard/builders/build-kpi-strip.ts`
  - `packages/ui-extension/src/dashboard/builders/build-tabs-bar.ts`
  - `packages/ui-extension/src/dashboard/format.ts`
  - `packages/ui-extension/src/dashboard/render-panel-health.ts`
  - `packages/ui-extension/src/dashboard/render-panel-plugins.ts`
  - `packages/ui-extension/src/dashboard/render-panel-spend.ts`
  - `packages/ui-extension/src/dashboard/render-panel-status.ts`
  - `packages/ui-extension/src/dashboard/render-panel-tokens.ts`
  - `packages/ui-extension/src/dashboard/render-panel-tools.ts`
  - `packages/ui-extension/tests/components/runtime.spec.ts`
  - `plugins/error-reporting/src/lib/mcp-internal-error.helper.ts`
  - `plugins/gitlab/tests/src/lib/tools.spec.ts`
  - `plugins/proposals/src/lib/agents/loop-detector-service.ts`
  - `plugins/proposals/src/lib/agents/zombie-reconcile.ts`
  - `plugins/proposals/tests/src/lib/agents/delivery-verifier.task-queue.spec.ts`
  - `plugins/proposals/tests/src/lib/agents/zombie-reconcile.lock-vanished.spec.ts`
  - `plugins/usage-tracking/tests/e2e/1000-calls-latency.e2e.spec.ts`
  - `plugins/web-fetch/src/lib/services/engine.ts`
  - `tools/scripts/build/stable-manifest.script.ts`
  - `tools/scripts/ci/local-repro.script.ts`
  - `tools/scripts/ci/pack-smoke.script.ts`
  - `tools/scripts/ci/verify-develop-health.script.ts`
  - `tools/scripts/compile/build.script.ts`
  - `tools/scripts/dev/api/real-data.ts`
  - `tools/scripts/lint/content-integrity.script.ts`
  - `tools/scripts/lint/llm-attribution-rules.ts`
  - `tools/scripts/lint/style-integrity.script.ts`
  - `tools/scripts/publish/workspace-deps.ts`
  - `tools/tests/ci/local-repro.spec.ts`

The security-and-quality suite, run locally with the CodeQL CLI against
this branch, is the measure: 48 alerts before, none after. Each is fixed
at its cause:

- **Command injection**: `local-repro` starts only a runtime the workflows
  invoke (`bun`, `bunx`, `node`, `npm`, `npx`), never a program named by a
  downloaded log; the terminal probe executes `$SHELL` only when it is one
  of a fixed list of shell paths (it still reports whatever `$SHELL` says);
  the `run-command` spec passes its paths through the environment.
- **Prototype pollution**: the configuration editor refuses `__proto__`,
  `constructor` and `prototype` at the write itself.
- **HTML from input**: every translated string and model value the
  dashboard and the configuration center interpolate is escaped; the bar
  chart uses the shared `escapeHtml`; numbers are formatted or escaped
  (the model arrives as JSON, so its static type is not a guarantee).
- **Request forgery**: the settings page forwards only `cwd` to
  `/api/setup/status`, the one parameter it reads.
- **Temporary files**: the file mutex creates its lock and marker `0600`;
  `workspace-deps` writes through `writeFileAtomic`.
- **File-system races**: nine check-then-read pairs read once.
- **Tag filters and sanitisation**: the dev page parses the document with
  `DOMParser`; the integrity lints accept `</script >`; the attribution
  lint matches domains with boundary checks instead of RegExps built from
  strings.
- **Stack traces**: the dashboard API returns the failure's kind and
  message, never the caught error.
- **Quality**: useless assignments, a redundant null check, a missing
  space, an expression statement and a test that asserted nothing. One of
  the useless assignments was a real bug: when the lock file vanished
  after a release, `zombie-reconcile` skipped the watchdog event
  (`continue`) instead of counting the lock as released, as it did before
  the read moved to `readLockText`.

## dependency graph

None.

## acceptance

- The release pull request's CodeQL check reports no new alert.
- The CodeQL security-and-quality suite reports no alert on `develop`.
- Every suite the changed files belong to passes.
