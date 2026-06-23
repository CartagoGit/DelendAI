---
id: u00002
status: ready
type: proposal
track: proposals-plugin+core+cli+skills+workflow
date: 2026-06-23
kind: feat
title: Gate `agent_worktree` behind a host-scoped flag (`--agent-worktree`, default off)
shipped-in: []
related:
    - f00036 # worktree discipline is the existing canonical surface
    - f00045 # f00045 already pinned the canonical wait/sync path
    - a00034 # latest exhaustive audit; H5/H6 cover durability + skill drift
    - AGENTS.md # "agents in 2+ sessions use their own agent_worktree"
ownership:
    - { agent: proposal_guardian,    task: 'S1: frontmatter + zod schema for `agentWorktree` in `mcp-vertex.config.json` (top-level, default false)' }
    - { agent: implementation_runner, task: 'S2: CLI parser accepts `--agent-worktree=true|false` in core; defaults to false' }
    - { agent: implementation_runner, task: 'S3: mcpv human CLI exposes the flag and forwards it to the host via `--agent-worktree`' }
    - { agent: implementation_runner, task: 'S4: assembleCliConfig projects `agentWorktree` onto IMcpPluginContext as `agentWorktreeEnabled: boolean`' }
    - { agent: implementation_runner, task: 'S5: `buildAgentWorktreeRegistration` reads the flag and returns a clear `ok: false` error when disabled' }
    - { agent: implementation_runner, task: 'S6: skills updated — the 4 affected playbooks consult the flag and split the flow into "default branch" vs "agent_worktree path"' }
    - { agent: implementation_runner, task: 'S7: tests + a00036 audit findings deferred here' }
globalGate: validate
acceptance:
    - { command: bun run typecheck,                 expect: exit0 }
    - { command: bun run test,                      expect: exit0 }
    - { command: bun run lint:proposals,            expect: exit0 }
    - { command: bun run lint:tools,                expect: exit0 }
    - { command: bun run validate,                  expect: exit0 }
---

# u00002 — Gate `agent_worktree` behind a host-scoped flag (default off)

## Goal

Make agent_worktree an **opt-in** capability. By default the proposals plugin does **not**
expose a working `agent_worktree` tool; the MCP server is configured at the host level to
either allow it (multi-agent worktrees) or refuse it (single-agent / shared-checkout
workflows). The flag is host-scoped (top-level in `mcp-vertex.config.json`) so it
governs a host capability, not a proposals-internal policy.

This repo (mcp-vertex itself) keeps the default `false`. Hosts that want
multi-agent worktree isolation flip it explicitly via `--agent-worktree=true` or
`agentWorktree: true` in the config.

## Why

Today's behaviour is hard-coded in two places that contradict each other:

1. `AGENTS.md` (line 101) says *"each agent uses its own `agent_worktree`"* whenever
   2+ agents share the repo.
2. `plugins/proposals/src/lib/tools/agent-worktree.tool.ts` always registers the tool
   and always executes — there is no host-level gate.

In a single-agent, single-checkout session (the most common case for this repo: one
orchestrator, one worktree, `develop` as the working branch), the tool being always
available is harmless but it is the wrong default for two reasons:

- It encourages agents that *could* just commit to `develop` to create
  `agent/<name>` branches and silently pile up disposable branches that are
  never cleaned up.
- The 4 skills (`proposal-swarm-runner`, `proposals-workflow-playbook`,
  `mcp-vertex-multi-agent-coordination`, `concurrency-patterns`) all start with
  *"if 2+ agents… use agent_worktree"* — that is a runtime *recommendation* in
  prose, not a host decision. The recommendation leaks into single-agent
  workflows that should never have created a worktree in the first place.

A host-scoped flag with default `false` aligns the skills with the actual runtime
and lets a host that *does* need multi-agent isolation opt in explicitly.

## Non-goals

- No new lock primitives. `agent_lock` and lock-released notifications stay as is.
- No replacement of the canonical wait/sync paths from f00036/f00045.
- No removal of `proposals_agent_worktree` from the tool registry. The tool
  stays registered; when disabled it returns a structured error that tells the
  caller how to enable it.
- No new public types. `IMcpPluginContext.agentWorktreeEnabled` is additive.
- No retroactive rewrite of audit findings — the slices either close audit findings
  or explicitly defer them to a follow-up proposal with a link.

## Slices

### S1 — Schema + frontmatter for `agentWorktree` top-level config

- **Files**:
  - `packages/core/schema/mcp-vertex.config.schema.json`
  - `packages/core/src/lib/plugins/load-config-file.ts` (`CONFIG_FILE_SCHEMA`)
- **Status**: pending
- **Gate**: `bun run typecheck`
- **Acceptance**:
  - "`agentWorktree` is a top-level boolean in the config schema, default `false`,
    validated through zod before any plugin registers."
  - "The JSON schema is regenerated (`bun run config:schema`) and the diff only
    adds the new property."
  - "`mcp-vertex.config.json` in this repo does not set it explicitly (relies on
    the default)."

### S2 — `--agent-worktree` in core CLI parser

- **Files**:
  - `packages/core/src/lib/plugins/parse-cli-args.ts` (`IMcpVertexCliArgs`,
    `KNOWN_KEYS`)
  - `packages/core/tests/src/lib/plugins/parse-cli-args.spec.ts`
- **Status**: pending
- **Gate**: `bun run test`
- **Acceptance**:
  - "Parser recognises `--agent-worktree=true|false` and `--agent-worktree` (bare =
    true) and stores the resolved boolean on `IMcpVertexCliArgs.agentWorktree`."
  - "Default when the flag is absent is `false`."
  - "Unknown future values (`--agent-worktree=maybe`) produce a clear parse error,
    not a silent `false`."
  - "At least 3 new spec cases: explicit `true`, explicit `false`, missing flag
    defaults to `false`."

### S3 — `mcpv --agent-worktree` + forwarding to host

- **Files**:
  - `packages/cli/src/lib/parser.ts` (`ICliGlobalOptions`)
  - `packages/cli/src/lib/server-args.ts` (`buildServerArgs`)
  - `packages/cli/src/index.ts` (no semantic change; only verify the forwarding)
  - `packages/cli/tests/**/*` (new spec for parser + builder)
- **Status**: pending
- **Gate**: `bun run test`
- **Acceptance**:
  - "`mcpv --agent-worktree` and `mcpv --agent-worktree=true` both end up as
    `--agent-worktree` in the forwarded `__serve` argv."
  - "`mcpv --no-agent-worktree` (or `--agent-worktree=false`) forwards the
    explicit `false`."
  - "`mcpv --help` shows the new flag in the global help text in all 12 languages
    (apps/web/src/i18n/cli.ts) — i18n parity enforced by `bun run check:i18n:cli`."

### S4 — Project `agentWorktree` onto the plugin context

- **Files**:
  - `packages/core/src/lib/cli/assemble.ts` (`buildContext`, `IMcpVertexHostConfig`)
  - `packages/core/src/lib/plugins/plugin-contract.ts` (`IMcpPluginContext`)
  - `packages/core/tests/src/lib/cli/assemble.spec.ts`
- **Status**: pending
- **Gate**: `bun run typecheck`
- **Acceptance**:
  - "`IMcpPluginContext.agentWorktreeEnabled: boolean` is always set (never
    `undefined`); the host wins over the file config, which wins over the
    `false` default."
  - "`assembleCliConfig` test covers: CLI overrides file, file overrides
    default, neither specified ⇒ `false`."
  - "The `IMcpVertexHostConfig` audit summary includes the resolved value so
    a00036-style audits can confirm it without re-reading the parser."

### S5 — `proposals_agent_worktree` honours the flag

- **Files**:
  - `plugins/proposals/src/lib/tools/agent-worktree.tool.ts` (`IAgentWorktreeToolOptions`,
    `buildAgentWorktreeRegistration`, the handler closure)
  - `plugins/proposals/src/index.ts` (pass `ctx.agentWorktreeEnabled` to the
    builder; extend `OptionsSchema` if the host flag needs validation —
    expected: it does not, because it lives on the host, not the plugin)
  - `plugins/proposals/tests/src/lib/plugin.spec.ts` (assert default = blocked)
  - `plugins/proposals/tests/src/lib/e2e/sync-and-locks.e2e.spec.ts` (add a
    case where the flag is `false` and verify the tool returns the documented
    error)
- **Status**: pending
- **Gate**: `bun run test`
- **Acceptance**:
  - "When `agentWorktreeEnabled === false`, the tool returns
    `{ ok: false, action: <echoed action>, reason: 'agent_worktree is disabled by host configuration. Pass --agent-worktree=true (CLI) or set agentWorktree: true in mcp-vertex.config.json to enable.' }`
    and never invokes the engine."
  - "When `agentWorktreeEnabled === true`, the tool behaviour is byte-identical
    to today (engine runs, branch + worktree created/listed/removed as
    before)."
  - "The error is a structured payload — no thrown exception — so the LLM
    that calls the tool can read the reason without parsing a stack trace."

### S6 — Update the 4 affected skills

- **Files**:
  - `skills/proposal-swarm-runner/SKILL.md`
  - `skills/proposals-workflow-playbook/SKILL.md`
  - `skills/mcp-vertex-multi-agent-coordination/SKILL.md`
  - `skills/concurrency-patterns/SKILL.md`
- **Status**: pending
- **Gate**: `bun run lint:proposals`
- **Acceptance**:
  - "Each skill adds a one-line decision node at the top of its
    'when to use agent_worktree' section:
    *'Read `mcp-vertex.config.json#agentWorktree` (or the
    `--agent-worktree` CLI flag). If `false`/`unset` — do not call
    `proposals_agent_worktree`; commit to the active branch instead.*'"
  - "`AGENTS.md` line 101 is updated to read 'each agent uses its own
    `agent_worktree` *only when the host has enabled
    `agentWorktree`/`--agent-worktree`*, otherwise commit to the active
    branch'."
  - "No skill silently contradicts another. The
    `concurrency-patterns` skill still documents the lock + worktree
    *primitives*; the *when-to-use* decision now lives in the four
    playbooks and respects the flag."

### S7 — Tests for the new path + a00036 audit findings

- **Files**:
  - `plugins/proposals/tests/src/lib/tools/agent-worktree.tool.spec.ts`
    (new) — covers the disabled path end-to-end with a fake `IGitRunner`
    to prove the engine is never invoked.
  - `packages/core/tests/src/lib/plugins/parse-cli-args.spec.ts` — extra
    cases for S2.
  - `packages/cli/tests/src/lib/parser.spec.ts` (or equivalent) — extra
    cases for S3.
  - `docs/proposals/ready/a00036-…md` (or `done/audits/a00036-…md` if the
    audit produces no internal slices) — references this proposal in the
    *Resolution Track* column for any finding that becomes obsolete with
    the flag (e.g. *"worktree discipline is best-effort"*) or surfaces
    new findings we did not anticipate.
- **Status**: pending
- **Gate**: `bun run validate`
- **Acceptance**:
  - "`bun run validate` exits 0."
  - "Coverage of the new flag in the affected packages: `core` ≥ 1 new
    spec, `cli` ≥ 1 new spec, `proposals` ≥ 2 new specs (unit + e2e)."
  - "The a00036 audit is filed (either as a deferred-ready proposal with
    internal slices or as a `done/audits/` entry) and lists `u00002` in
    any related row."

## acceptance

- `bun run validate` is green on `develop` after merging the slice chain.
- In this repo, the default config + a fresh `bun run host` start means
  `proposals_agent_worktree` is *registered* but always returns the
  documented `ok: false` error — verifiable by `mcpv tools list` or by
  calling the tool from any host.
- A host that needs worktrees can opt in with a one-liner in the config
  or one CLI flag, no plugin code change.
- The 4 skills and `AGENTS.md` no longer recommend `agent_worktree` for
  single-agent sessions.

## risks and mitigations

- **Existing consumers** that pass `--agent-worktree` (none in this repo
  today — the flag is new) keep working because unknown future values
  parse to `false` deterministically, not to a silent crash. We add a
  unit test for the rejection path in S2 to lock that in.
- **`mcpv` global help** has a long, hand-curated i18n surface. S3 has a
  dedicated test that asserts the new key exists in all 12 languages
  before `bun run check:i18n:cli` is allowed to pass.
- **`proposals_agent_worktree` being always registered** (not unregistered)
  preserves the SDK contract: hosts that introspect the tool list
  continue to see it; only the runtime behaviour changes. This is the
  choice the user picked in pre-design (block, not unregister).
