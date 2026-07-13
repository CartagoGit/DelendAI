# @mcp-vertex/orchestrator-runner

The **headless routing brain** for `@mcp-vertex/core`. It healthchecks the
model-provider CLIs installed on the host, scores them against a task's
capability hints with a **pure, deterministic scorer**, and advises which
provider to route to. In this slice (f00067 S4) it **advises only** — it never
spawns a model subprocess or spends money (subprocess invocation lands in S6).

> Requires the [`usage-tracking`](../usage-tracking) plugin: every routing
> decision it advises (and, from S6, executes) must be recorded for spend
> auditing. This is a hard `dependsOn` — the loader refuses the batch when
> `usage-tracking` is not also loaded (CRITICAL I15).

```bash
mcp-vertex --plugins=usage-tracking,orchestrator-runner
```

## Tools (3 of the runner's eventual 10)

| Tool | Effects | Purpose |
|---|---|---|
| `<prefix>_healthcheck_providers` | `spawn`, `write` | Probe each provider CLI on PATH (`command -v` + `--version`); report install/auth/model availability with an `installHint` for missing CLIs (pipe-to-shell installers flagged `dangerous:true`, CRITICAL I4). Refreshes the in-memory availability mirror and writes a durable snapshot. |
| `<prefix>_advise_routing` | none | Score the roster for a task and return the winning `IRoutingDecision` (strategy `passthrough`/`api`/`cli`/`mcp-tool`/`handoff`), the top-2 backups and a transparent scoring trace. Pass a `sessionId` for sticky routing (TTL 300s, CRITICAL I12). |
| `<prefix>_get_quota` | none | Read the per-provider quota snapshot (written by the bootstrap/quota layer in S5); tolerates a missing file with `{present:false}`. |

The scorer lives at [`src/lib/router/score.ts`](src/lib/router/score.ts) and is the
single canonical `scoreProvider(p, hint, health)` referenced by the wiki. Mode
cost-tier targets are `{plan:4, review:3, implement:2, explore:1}` (CRITICAL N10).

## Configuration (`plugins.orchestrator-runner.options`)

| Field | Default | Meaning |
|---|---|---|
| `providers` | `[]` | The provider roster (pragmatic S4 source; canonical home is the root-level `providers` block that S5's bootstrap writes). Empty → `advise_routing` returns a `handoff` pointing at bootstrap. |
| `sessionStickinessTtlSeconds` | `300` | How long a `sessionId` keeps its routing decision. |
| `defaultCostPreference` | `balanced` | `minimize` \| `balanced` \| `maximize` when a caller omits it. |
| `dependencies` | – | Passthrough for injected cross-plugin deps (e.g. the shared loop detector). |

## Cache layout

All runtime state lives under `${cacheDir}/orchestrator-runner/` (workspace-scoped,
gitignored). Writes go through `withFileMutex` + `writeFileAtomic` and are piped
through `redactSecrets` first.

- `healthcheck.json` — last availability snapshot (next-boot recovery; the hot
  path reads the in-memory mirror, never this file).
- `quotas.json` — quota snapshot (written by S5; read-only here).

## Loop detection

Reuses the **one** loop detector in the proposals plugin
(`AgentLoopDetectorService`) via an injected seam
(`ctx.options.dependencies.loopDetector`) — never a second detector, never a
cross-plugin import (AGENTS.md rule 1).

## Kill switch

Opt-in: not in the default preset. Omit it from `--plugins` (or your config's
`plugins` list) and the runner does not load.

## Status

f00067 **S4** (headless brain) is implemented: healthcheck + pure scorer +
`advise_routing` + `get_quota`. S5 adds the bootstrap wizard + quota tracking;
S6 adds subprocess invocation (the remaining 6 tools). The provider `providers`
config lives on this plugin's options until core surfaces the root-level block.
