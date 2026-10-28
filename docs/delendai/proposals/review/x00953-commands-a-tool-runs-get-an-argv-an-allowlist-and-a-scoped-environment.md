---
id: x00953
title: "Commands a tool runs get an argv, an allowlist and a scoped environment"
kind: fix
status: review
type: proposal
track: a00095-consistency
date: 2026-10-23
last-transition-id: 08934cbf-1733-4dca-8095-cd6fa07f886a
last-correlation-id: 08934cbf-1733-4dca-8095-cd6fa07f886a
last-transition-from: in-progress
last-transition-at: 2026-10-27T04:52:06.333Z
shipped-in:
  - "ee98acec2fa4"
---

# x00953 — Commands a tool runs get an argv, an allowlist and a scoped environment

## goal

No tool passes caller text to a shell or to a CLI as an option, read-only database queries are read-only by construction, external MCP servers and provider CLIs start from an allowlist with only the environment they declare, and the API transport honours the account's credential policy.

## why

Joint audit a00095 and gpt-6.1-sol. G107: the acceptance-criteria runner executes commands through a shell with the full environment. G115: git_show.ref and git_changelog.range reach git as options; `--output=` writes a file. G116: repository and ticket selectors reach the CLI or the API path unvalidated. G120: quality_policy_run_settlement runs any validateCommand with `bash -c`. G114: db_query classifies any statement starting with WITH as read-only, and a WITH ... DELETE runs. G54: external-mcps spawns the configured command without an allowlist (a knob, not a boundary). G131: a `cli` provider without an account or env list inherits the whole server environment (G25's remaining part). sol C2 (P1): the orchestrator-runner API transport ignores the account policy and credentialEnv. D95: external-mcps rejects valid env configs as missing-env. D123: execution-env's ssh quoting is right; the gap is the missing allowlist of programs.

## non-goals

- Network egress (x00951).
- Filesystem containment (x00952).

## slices

- global_gate: type

### S1 — No caller text becomes a shell or an option
- **Status**: done
- **Files**: `plugins/forge/src/lib/contracts/constants/forge-read.constant.ts`, `plugins/git/src/lib/services/changelog.ts`, `plugins/git/src/lib/services/git.ts`, `plugins/git/src/lib/tools/tools.ts`, `plugins/git/tests/src/lib/changelog.spec.ts`, `plugins/git/tests/src/lib/git.spec.ts`, `plugins/github/src/lib/contracts/constants/github-selectors.constant.ts`, `plugins/github/src/lib/mutations.ts`, `plugins/github/src/lib/tools/catalog.ts`, `plugins/github/src/lib/tools/write-tools.ts`, `plugins/github/tests/src/lib/selectors.spec.ts`, `plugins/proposals/src/lib/contracts/constants/acceptance-env.constant.ts`, `plugins/proposals/src/lib/proposals/proposal-acceptance.ts`, `plugins/proposals/tests/src/lib/proposals/acceptance-exec.spec.ts`, `plugins/github/tests/src/lib/mutations.spec.ts`, `plugins/github/tests/src/lib/catalog-sweep.spec.ts`, `plugins/git/tests/src/lib/tools.spec.ts`
- **Gate**: type
- acceptance:
  - "Acceptance commands run as argv without a shell: one with an unquoted pipe, redirect or chain is refused with the reason; the environment is built from an allowlist (G107)."
  - "A ref or range starting with `-` is refused, and git receives `--end-of-options` before it (G115)."
  - "Repository and ticket selectors are validated against owner/name and numeric patterns before reaching gh, glab or a URL path (G116)."
- shipped-in: `ee98acec2fa4`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at ee98acec2fa4, validate exit 0 and tests 75/75 claimed, no recorded run cited; acceptance 3/3: (1) proposal-acceptance.ts:341 strips quoted spans before testing for shell metacharacters and :419 refuses with the reason that no criterion reaches a shell, with… (2) git.ts:309 refuses a ref starting with a hyphen and :317 passes --end-of-options before it; changelog.ts:118 refuses a range starting with a hyphen and :134 pa… (3) github-selectors.constant.ts defines the owner, repository and number patterns and they are applied in catalog.ts:184 and :989, write-tools.ts:36, :303 and :32… — Type gate ran once for the pack in the unit worktree: bun run typecheck exited 0. Slice specs: proposals and git 4 files / 52 tests, github 3 files / 15 tests, plus the forge regression 2 files / 8 tests, all exit 0. Residual outside the criterion's wording, for a follow-up: catalog.ts still accepts a bare non-empty string for workflowId, runId, jobId, releaseId, deploymentId and for sha, ref and branch, each interpolated into a repository URL path.

### S2 — Read-only queries and settlement commands
- **Status**: done
- **Files**: `plugins/database/src/lib/query/query-engine.spec.ts`, `plugins/database/src/lib/query/query-engine.ts`, `plugins/database/src/lib/query/sqlite-query-driver.ts`, `plugins/quality-policy/AGENT.md`, `plugins/quality-policy/src/lib/services/settlement-runner.ts`, `plugins/quality-policy/src/lib/tools/settlement.tool.ts`, `plugins/quality-policy/tests/src/lib/services/settlement-runner.service.spec.ts`, `tests/e2e/eventual-settlement.spec.ts`, `plugins/quality-policy/tests/src/lib/services/settlement-runner-execution.service.spec.ts`, `plugins/quality-policy/tests/src/lib/settlement.tool.spec.ts`
- **Gate**: type
- acceptance:
  - "db_query hands its read classification to the driver, and SQLite runs every read on a connection opened read-only, so a WITH ... DELETE fails there (G114)."
  - "The settlement runner executes validateCommand only as `bun run <script>` for a script in the project's package.json, as argv, never `bash -c` on free text; its cwd stays in the workspace (G120)."
- shipped-in: `ee98acec2fa4`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at ee98acec2fa4, validate exit 0 and tests 20/20 claimed, no recorded run cited; acceptance 2/2: (1) query-engine.ts:378 passes readOnly: classification === 'read' to the driver and sqlite-query-driver.ts:99-108 opens the read connection with readonly and file… (2) settlement-runner.ts:31-52 accepts only a bun run script that is declared in the project's package.json and :78 runs it as execFile with the script name as an … — Type gate ran once for the pack in the unit worktree: bun run typecheck exited 0. Slice specs: 4 files / 18 tests and the e2e file 1 file / 2 tests, all exit 0. Recorded rather than blocked: no automated test drives the real SQLite driver, because better-sqlite3 is an optional peer dependency that is not installed in this workspace, so the read-only refusal rests on the shipped code; the criterion should say so. The shipped commit also re-fitted this criterion's wording to the implementation, which the proposal author should note.

### S3 — Spawned servers and providers get an allowlist and their own env
- **Status**: done
- **Files**: `docs/delendai/TOKEN-BUDGETS.md`, `packages/core/src/lib/contracts/constants/preset-metadata.generated.ts`, `plugins/execution-env/src/lib/adapters/ssh.service.ts`, `plugins/execution-env/src/lib/contracts/constants/ssh.constant.ts`, `plugins/execution-env/src/lib/contracts/interfaces/ssh-execution.interface.ts`, `plugins/execution-env/tests/src/lib/adapters/ssh.spec.ts`, `plugins/external-mcps/src/index.ts`, `plugins/external-mcps/src/lib/contracts/constants/allowed-commands.constant.ts`, `plugins/external-mcps/src/lib/options-schema.ts`, `plugins/external-mcps/src/lib/subprocess/server-registry.ts`, `plugins/external-mcps/tests/src/lib/catalog.spec.ts`, `plugins/external-mcps/tests/src/lib/server-registry.spec.ts`, `plugins/orchestrator-runner/src/lib/contracts/interfaces/account-environment.interface.ts`, `plugins/orchestrator-runner/src/lib/invoke/build-manager.ts`, `plugins/orchestrator-runner/src/lib/services/account-environment.service.ts`, `plugins/orchestrator-runner/src/lib/subprocess/api.ts`, `plugins/orchestrator-runner/tests/src/lib/services/account-environment.service.spec.ts`
- **Gate**: type
- acceptance:
  - "external-mcps spawns only commands an allowlist in config names, and LLM-driven activation cannot add one (G54)."
  - "A declared env key whose value is present is not reported missing (D95)."
  - "Every cli provider, with or without an account, starts from a minimal environment plus the keys it declares (G131, G25)."
  - "The API transport reads credentials through the account's credentialEnv and refuses a call the account policy forbids (sol C2)."
  - "execution-env refuses programs outside its allowlist before quoting them (D123)."
- shipped-in: `ee98acec2fa4`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- Acceptance commands run as argv without a shell: one with an unquoted pipe, redirect or chain is refused with the reason; the environment is built from an allowlist (G107).
- A ref or range starting with `-` is refused, and git receives `--end-of-options` before it (G115).
- Repository and ticket selectors are validated against owner/name and numeric patterns before reaching gh, glab or a URL path (G116).
- db_query hands its read classification to the driver, and SQLite runs every read on a connection opened read-only, so a WITH ... DELETE fails there (G114).
- The settlement runner executes validateCommand only as `bun run <script>` for a script in the project's package.json, as argv, never `bash -c` on free text; its cwd stays in the workspace (G120).
- external-mcps spawns only commands an allowlist in config names, and LLM-driven activation cannot add one (G54).
- A declared env key whose value is present is not reported missing (D95).
- Every cli provider, with or without an account, starts from a minimal environment plus the keys it declares (G131, G25).
- The API transport reads credentials through the account's credentialEnv and refuses a call the account policy forbids (sol C2).
- execution-env refuses programs outside its allowlist before quoting them (D123).
