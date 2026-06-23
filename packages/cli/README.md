# @mcp-vertex/cli

Single human-facing CLI for `mcp-vertex`. It exposes the same MCP tool
surface used by IDE hosts, but from a terminal.

```bash
bun run cli -- --help
bun run cli -- overview --json
bun run cli -- search "assembleCliConfig" --max=5
```

The CLI is a thin wrapper over the public core/client surfaces. It starts the
same MCP server used by hosts and calls MCP tools over stdio instead of
importing plugin internals.

## Commands

`mcpv --help` lists the full surface grouped by group; `--help --lang=es`
(and 11 other locales) renders the same help translated. Every plugin
tool has a 1:1 subcommand — the CLI is pure delegation, no domain logic.

| Group | Commands |
|---|---|
| **core** | `status`, `overview`, `plugin list/inspect`, `metrics`, `validate`, `validate-matrix`, `config show/get/set/doctor/schema`, `init`, `search`, `scaffold` |
| **fs / knowledge / project** | `fs read/write`, `knowledge`, `project analyze/plan/create` |
| **git** | `git status/changed/diff/log/blame/show/worktree` |
| **memory** | `memory save/recall/list/forget/export/import` |
| **deps / rules / test-convention** | `deps list/check/polyglot`, `rules get/check/apply`, `test-convention get/suggest/scan` |
| **quality / audit / logs** | `quality scopes/run/cancel/run-all`, `audit plan/consolidate`, `logs query/tail/subscribe/correlate/redact-test` |
| **docs** | `docs list/read/search` |
| **proposals** | `proposals auto-work/continue/create/close-slice/transition/board/status/health/agent-names/lock/worktree/stale-list/round-context/workflow/diagnose/adopt/force-transition/reconcile-folder/state-repair/release-orphan/review/sync/task-queue/delegate/plan` |
| **notification / web-fetch / status-marker** | `notification status/await-lock`, `web-fetch`, `status-marker close/validate/ping` |
| **conventions** | `conventions check/plan/apply` |
| **doctor / completion** | `doctor` (sectioned health, exit 0/1/2), `completion bash\|zsh\|fish` |

`mcpv doctor --json` returns `{ status, sections }` for CI. `eval "$(mcpv
completion bash)"` installs shell completion derived from the live
command registry.

## Examples

```bash
bun run cli -- status --json
bun run cli -- plugin list --plugins=docs,search
bun run cli -- docs list --max=10 --json
bun run cli -- docs read docs/ARCHITECTURE.md
bun run cli -- config get plugins.docs.options.roots
```

Write-side commands use the public durable primitives from
`@mcp-vertex/core/public`: workspace containment, file mutexes, atomic writes
and secret redaction.

```bash
tmp="$(mktemp -d)"
bun run cli -- --workspace "$tmp" init
bun run cli -- --workspace "$tmp" config set plugins.docs.options.roots='["docs"]'
bun run cli -- --workspace "$tmp" scaffold tool --name=demo --out=demo.tool.ts
```

## Transport

Default mode starts a local MCP server for the selected workspace and calls it
over stdio. `--remote=stdio` keeps the same command parser and result shape,
while making the transport choice explicit. `tcp://host:port` is reserved for a
future transport and currently exits with code `6`.

```bash
bun run cli -- --remote=stdio overview --json
```
