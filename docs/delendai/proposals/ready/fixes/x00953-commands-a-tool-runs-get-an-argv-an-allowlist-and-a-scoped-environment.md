---
id: x00953
title: "Commands a tool runs get an argv, an allowlist and a scoped environment"
kind: fix
status: ready
type: proposal
track: a00095-consistency
date: 2026-10-23
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
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/proposals/proposal-acceptance.ts`, `plugins/git/src/lib/services/git.ts`, `plugins/git/src/lib/services/changelog.ts`, `plugins/git/src/lib/tools/tools.ts`, `plugins/forge/src/lib/services/forge.ts`, `plugins/forge/src/lib/contracts/constants/forge-read.constant.ts`, `plugins/github/src/lib/mutations.ts`
- **Gate**: type
- acceptance:
  - "Acceptance commands run as argv without a shell, with an environment built from an allowlist (G107)."
  - "A ref or range starting with `-` is refused, and git receives `--end-of-options` before it (G115)."
  - "Repository and ticket selectors are validated against owner/name and numeric patterns before reaching gh, glab or a URL path (G116)."

### S2 — Read-only queries and settlement commands
- **Status**: pending
- **Files**: `plugins/database/src/lib/query/query-engine.ts`, `plugins/database/src/lib/query/sqlite-query-driver.ts`, `plugins/quality-policy/src/lib/services/settlement-runner.ts`, `plugins/quality-policy/src/lib/tools/settlement.tool.ts`
- **Gate**: type
- acceptance:
  - "db_query runs read-only statements on a read-only connection (query_only / readonly open), so a WITH ... DELETE fails (G114)."
  - "The settlement runner executes validateCommand as argv from the project's command policy, never `bash -c` on free text (G120)."

### S3 — Spawned servers and providers get an allowlist and their own env
- **Status**: pending
- **Files**: `plugins/external-mcps/src/index.ts`, `plugins/external-mcps/src/lib/subprocess/server-registry.ts`, `plugins/orchestrator-runner/src/lib/invoke/build-manager.ts`, `plugins/orchestrator-runner/src/lib/invoke/manager.ts`, `plugins/orchestrator-runner/src/lib/services/account-environment.service.ts`, `plugins/orchestrator-runner/src/lib/subprocess/api.ts`, `plugins/execution-env/src/lib/helpers/shell-quoting.helper.ts`
- **Gate**: type
- acceptance:
  - "external-mcps spawns only commands an allowlist in config names, and LLM-driven activation cannot add one (G54)."
  - "A declared env key whose value is present is not reported missing (D95)."
  - "Every cli provider, with or without an account, starts from a minimal environment plus the keys it declares (G131, G25)."
  - "The API transport reads credentials through the account's credentialEnv and refuses a call the account policy forbids (sol C2)."
  - "execution-env refuses programs outside its allowlist before quoting them (D123)."

## acceptance

- Acceptance commands run as argv without a shell, with an environment built from an allowlist (G107).
- A ref or range starting with `-` is refused, and git receives `--end-of-options` before it (G115).
- Repository and ticket selectors are validated against owner/name and numeric patterns before reaching gh, glab or a URL path (G116).
- db_query runs read-only statements on a read-only connection (query_only / readonly open), so a WITH ... DELETE fails (G114).
- The settlement runner executes validateCommand as argv from the project's command policy, never `bash -c` on free text (G120).
- external-mcps spawns only commands an allowlist in config names, and LLM-driven activation cannot add one (G54).
- A declared env key whose value is present is not reported missing (D95).
- Every cli provider, with or without an account, starts from a minimal environment plus the keys it declares (G131, G25).
- The API transport reads credentials through the account's credentialEnv and refuses a call the account policy forbids (sol C2).
- execution-env refuses programs outside its allowlist before quoting them (D123).
