# @delendai/cli

Single human-facing CLI for `delendai`. It exposes the same MCP tool
surface used by IDE hosts, but from a terminal.

```bash
bun run cli -- --help
bun run cli -- overview --json
bun run cli -- search "assembleCliConfig" --max=5
```

The CLI is a thin wrapper over the public core/client surfaces. It starts the
same MCP server used by hosts and calls MCP tools over stdio instead of
importing plugin internals.

## KPI adapter pending

f00282 S4 adds standalone KPI command modules at src/commands/kpis.command.ts,
src/commands/kpis-renderer.ts and src/commands/kpis-options.ts plus the focal
spec at tests/kpis.command.spec.ts. This slice intentionally does not touch the
global registry, so the command is implemented and validated in isolation but
not yet wired into registerAllCommands.

When the slice opens registry edits, the adapter is one import plus one spread:
load kpisCommands from src/commands/kpis.command.ts and append it in
src/commands/registry.ts. No extra aggregation work is needed because the
command already consumes the bounded delendai_project_kpis snapshot together
with persisted history.json and usage-summary.json evidence.

The supported views are summary, history, usage, costs, models, agents,
plugins, errors, efficiency and audit. JSON mode returns a stable
cli.kpis-report envelope for the selected view. Watch mode emits repeated text
frames or newline-delimited JSON frames and threshold mode can fail CI with
expressions such as --threshold=health.score>=80 or
--threshold=telemetry.failedCalls<=0.

## Commands

`delendai --help` lists the full surface grouped by group; `--help --lang=es`
(and 11 other locales) renders the same help translated. Every plugin
tool has a 1:1 subcommand — the CLI is pure delegation, no domain logic.

| Group                                        | Commands                                                                                                                                                                                                                                                       |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **core**                                     | `status`, `overview`, `plugin list/inspect`, `metrics`, `validate`, `validate-matrix`, `config show/get/set/doctor/schema`, `init`, `init:default`, `init:global`, `search`, `scaffold`                                                                        |
| **fs / knowledge / project**                 | `fs read/write`, `knowledge`, `project analyze/plan/create`                                                                                                                                                                                                    |
| **git**                                      | `git status/changed/diff/log/blame/show/worktree`                                                                                                                                                                                                              |
| **memory**                                   | `memory save/recall/list/forget/export/import`                                                                                                                                                                                                                 |
| **deps / rules / test-convention**           | `deps list/check/polyglot`, `rules get/check/apply`, `test-convention get/suggest/scan`                                                                                                                                                                        |
| **quality / audit / logs**                   | `quality scopes/run/cancel/run-all`, `audit plan/consolidate`, `logs query/tail/subscribe/correlate/redact-test`                                                                                                                                               |
| **docs**                                     | `docs list/read/search`                                                                                                                                                                                                                                        |
| **proposals**                                | `proposals auto-work/continue/create/close-slice/transition/board/status/health/agent-names/lock/worktree/stale-list/round-context/workflow/diagnose/adopt/force-transition/reconcile-folder/state-repair/release-orphan/review/sync/task-queue/delegate/plan` |
| **notification / web-fetch / status-marker** | `notification status/await-lock`, `web-fetch`, `status-marker close/validate/ping`                                                                                                                                                                             |
| **conventions**                              | `conventions check/plan/apply`                                                                                                                                                                                                                                 |
| **doctor / completion**                      | `doctor` (sectioned health, exit 0/1/2), `completion bash\|zsh\|fish`                                                                                                                                                                                          |

`delendai doctor --json` returns `{ status, sections }` for CI. `eval "$(delendai
completion bash)"` installs shell completion derived from the live
command registry.

## Examples

```bash
bun run cli -- status --json
bun run cli -- plugin list --plugins=docs,search
bun run cli -- docs list --max=10 --json
bun run cli -- docs read docs/delendai/ARCHITECTURE.md
bun run cli -- config get plugins.docs.options.roots
```

Write-side commands use the public durable primitives from
`@delendai/core/public`: workspace containment, file mutexes, atomic writes
and secret redaction.

```bash
tmp="$(mktemp -d)"
bun run cli -- --workspace "$tmp" init
bun run cli -- --workspace "$tmp" config set plugins.docs.options.roots='["docs"]'
bun run cli -- --workspace "$tmp" scaffold tool --name=demo --out=demo.tool.ts
```

### Global host setup

Use `init:global` once per user account to merge the shared `delendai` server
into every supported global host configuration. It does not write project files
such as `.vscode/mcp.json`, `.cursor/mcp.json`, or `.mcp.json`.

```bash
# Install into all supported global hosts for the current platform.
delendai init:global --all

# Install only selected global targets.
delendai init:global --ide=cursor-global,windsurf,claude-desktop,antigravity,zed
```

The valid global target ids are `cursor-global`, `windsurf`,
`claude-desktop`, `antigravity`, and `zed`. Project-only ids such as `vscode`,
`cursor`, and `claude-code` are rejected by `init:global`; use `init` with an
explicit `--ide=<id>` for those. An empty or unknown `--ide` value is also an
error and never falls back to project autodetection.

The installer merges only the `delendai` entry and preserves unrelated MCP
servers and host settings. Runner and preset flags are shared with `init`, for
example `--via=bunx --preset=swarm`. On WSL, the command writes to the Linux
home by default; Windows-side applications may require an explicit target path
or host-native setup.

`init:global` installs the MCP connection, not a second copy of agent rules.
All agents should follow the canonical bootstrap at
`docs/delendai/AGENT-BOOTSTRAP.md`; use `init` or `init:default` inside a
project when that project needs host-specific pointer files and generated
agent adapters. MCP provides the same server tools to Claude, Copilot, Cursor,
Codex, Continue, Aider, and other MCP-capable hosts, while each host retains
its own instruction-file convention.

## Transport

Default mode starts a local MCP server for the selected workspace and calls it
over stdio. `--remote=stdio` keeps the same command parser and result shape,
while making the transport choice explicit. `tcp://host:port` is reserved for a
future transport and currently exits with code `6`.

```bash
bun run cli -- --remote=stdio overview --json
```
