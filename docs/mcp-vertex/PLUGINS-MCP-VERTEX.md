# Creating plugins for mcp-vertex

A **plugin** is an npm package (or a local module) that adds tools, prompts,
resources and knowledge to an mcp-vertex server. You enable it at runtime:

```bash
mcp-vertex --plugins=myfeature
```

mcp-vertex resolves `myfeature` to a module (see _Resolution_ below), imports it,
and calls its `register(ctx)`. One plugin failing never aborts the others.

## The contract

A plugin module **default-exports** an `IMcpPlugin` (or a factory returning
one). Use `definePlugin` for type-safety:

```ts
import { definePlugin } from '@mcp-vertex/core/public';
import { z } from 'zod';

export default definePlugin({
	name: 'myfeature',          // also the default tool namespace + cache dir
	version: '0.1.0',
	describe: 'What this plugin adds, in one model-agnostic line.',
	register(ctx) {
		const prefix = ctx.namespacePrefix; // 'myfeature' unless overridden
		return {
			tools: [
				{
					id: 'myfeature_do',
					register: async (server) => {
						server.registerTool(
							`${prefix}_do`,
							{ description: '…', inputSchema: z.object({ x: z.string() }) },
							async ({ x }) => ({
								content: [{ type: 'text', text: JSON.stringify({ ok: true, x }) }],
							}),
						);
					},
				},
			],
			knowledge: [{ id: 'myfeature-overview', title: 'My feature', body: '…' }],
			// prompts: [...], resources: [...], skills: [...]  (all optional)
		};
	},
});
```

### What `register` receives (`ctx`)

| Field | Meaning |
|---|---|
| `ctx.workspace` | Resolves workspace-relative paths to absolute. **Never use `process.cwd()`.** |
| `ctx.corePaths` | `{ cacheDir, docsDir }` as resolved from the CLI. |
| `ctx.cacheDir` / `ctx.docsDir` | Shorthands for the above. |
| `ctx.keepLegacy` | Global preservation preference from `mcp-vertex.config.json` (default `false`). Plugins that regenerate durable project files should preserve the old file first when this is `true`. |
| `ctx.pluginCacheDir` | Your private scratch root: `<cacheDir>/<name>`. |
| `ctx.pluginDocsDir` | Your docs root: `<docsDir>/<name>`. |
| `ctx.namespacePrefix` | Tool namespace (default `name`, override with `plugins.<name>.prefix` in the config file). |
| `ctx.options` | **Your typed options** from `mcp-vertex.config.json` → `plugins.<name>.options` (any JSON). Empty `{}` when absent. This is the structured way to receive values. |
| `ctx.args` | Unrecognised global `--key=value` CLI flags, forwarded for you to read. |

### Receiving values (`mcp-vertex.config.json`)

Users pass values to your plugin through the config file at the workspace root:

```jsonc
{ "plugins": { "myfeature": { "prefix": "mf", "options": { "limit": 10, "paths": ["a", "b"] } } } }
```

Read them in `register` via `ctx.options.limit` etc. Validate them yourself
(e.g. with zod) and apply defaults — treat `ctx.options` as untrusted JSON.

### What `register` returns (`IMcpPluginRegistrations`)

All optional: `tools`, `prompts`, `resources`, `knowledge`, `skills`.

## Resolution

`--plugins=<spec>` is resolved in order:

1. `./path` or `/abs` or `file:` → used verbatim (great for local dev).
2. `@scope/pkg` (contains `/`) → used verbatim.
3. bare `name` → `@mcp-vertex/<name>`, then `mcp-<name>`, then `name`.

The same chain applies to every entry under `plugins.<name>` in
`mcp-vertex.config.json` — when an entry has no `path` field the
resolver treats the entry key as a bare name.

## Loading a local plugin (f00087)

Three supported paths, in increasing order of intrusiveness:

1. **`path` in `mcp-vertex.config.json`** (recommended). The entry
   declares an explicit module path that survives across hosts
   (VS Code, Cursor, Claude Code, Cline, …):

   ```jsonc
   {
     "plugins": {
       "lx-app": {
         "path": "libs/plugins/lx-app/dist/index.js",
         "prefix": "lx"
       }
     }
   }
   ```

   Relative paths resolve against the workspace root; absolute paths
   and `file:`/`./`/`/`-prefixed values pass through verbatim. This
   is the only form that lets you commit the load declaration to
   version control without touching host-specific files.

2. **`--plugins=<path>` CLI flag**. Pass the absolute or
   workspace-relative path to the host entry-point (e.g. in
   `.vscode/mcp.json`'s `args`):

   ```jsonc
   {
     "servers": {
       "mcp-vertex": {
         "command": "bun",
         "args": [
           "/abs/path/to/mcp-vertex/tools/scripts/host/host-server.script.ts",
           "--workspace=${workspaceFolder}",
           "--config=${workspaceFolder}/mcp-vertex.config.json",
           "--plugins=${workspaceFolder}/libs/plugins/lx-app/dist/index.js"
         ]
       }
     }
   }
   ```

   Host-specific — every host has its own MCP config file — but
   useful when the path is genuinely host-scoped.

3. **Symlink under `node_modules`**. The historical workaround:
   `ln -s ../libs/plugins/lx-app node_modules/@mcp-vertex/lx-app`
   makes the bare-name fallback chain resolve. Works, but fragile
   (gets wiped by `bun install --force`) and not portable across
   hosts.

When the same plugin name appears in both `--plugins=<bare-name>`
and `mcp-vertex.config.json#plugins.<name>`, both contribute
specifiers — and `--exclude-plugins=<name>` matches the resolved
`IMcpPlugin.name` after `register()`, so excluding a `path`-loaded
plugin by its config key still works.

## Generate a plugin skeleton

Let mcp-vertex write the boilerplate for you, either through the MCP
scaffold tool or through the standalone CLI script that uses the
same generator:

```bash
# via the MCP scaffold tool (kind: plugin):
mcp-vertex_scaffold  { "kind": "plugin", "pluginName": "myfeature", "description": "…" }

# via the standalone script (works without an MCP host):
bun run plugin:create myfeature -- "What myfeature adds"
```

Both produce `plugins/myfeature/` (the MCP scaffold) or
`libs/plugins/myfeature/` (the script) with `package.json`,
`tsconfig.json`, `src/index.ts` (a working `IMcpPlugin` with a
`_ping` tool) and a `README.md`. The script honours `--keep-legacy`
so existing files are moved aside instead of refused.

For programmatic scaffolding from a build/test script, import the
pure generators directly:

```ts
import {
  scaffoldPluginFiles,
  writeScaffoldedFilesOrThrow,
} from '@mcp-vertex/client';

const files = scaffoldPluginFiles({
  pluginName: 'myfeature',
  description: 'What myfeature adds',
});
await writeScaffoldedFilesOrThrow('./libs/plugins/myfeature', files);
```

## Presets

Use `--preset=minimal|standard|swarm|full` when you want a curated plugin set
instead of spelling out `--plugins=...`. The canonical membership lives in
`packages/core/src/lib/plugins/preset-catalog.ts`; the web `/presets` page
renders that catalog directly, so docs and CLI stay aligned.

## Personal / host-only plugins

### Issues plugin

The `issues` plugin is part of `full` and is the repo-facing GitHub integration for reading issues against the current workspace repository.
**Note: This plugin has a hard dependency on the `proposals` plugin.** You must have `proposals` loaded for `issues` to work.

### Setup

Use [CROSS-PROJECT-SETUP.md](./CROSS-PROJECT-SETUP.md) for the canonical first-run flow. That guide covers the required `plugins.issues.options.repo` config, the `gh` versus `GITHUB_TOKEN` versus anonymous auth decision, and the matching `mcp.json` launch shape. The dedicated `setup-github` subcommand and MCP tool are scheduled in S2 of proposal `f00030`; until that lands, the markdown guide is the source of truth.

## Provider orchestration plugins (opt-in)

These two plugins are **opt-in**: they are in **no** preset (not `minimal`,
`standard`, `swarm`, or `full`). Load them explicitly with
`--plugins=usage-tracking,orchestrator-runner` (or a `plugins.<name>` block).
See [CROSS-PROJECT-SETUP.md](./CROSS-PROJECT-SETUP.md#model-providers-and-the-orchestrator-opt-in)
for the end-to-end `providers` config walkthrough.

### orchestrator-runner

The headless routing brain: it healthchecks the model-provider CLIs/APIs on the
host, scores them against a task's capability hints with a pure deterministic
scorer, advises which provider to route to, and — gated by `executeApi` + a
signed confirmation token — can execute a task on the best provider with
fallback.

**Public tools** (11, all namespace-qualified as `<prefix>_<id>`):

| Tool | Effects | Purpose |
|---|---|---|
| `healthcheck_providers` | `spawn`, `write` | Probe each provider; refresh the availability mirror + durable snapshot. |
| `discover_providers` | `spawn` | Detect which provider CLIs are installed/authed on the host. |
| `bootstrap_providers` | `write` | Interactive/opinionated wizard that writes the roster + quota snapshot. |
| `advise_routing` | none | Score the roster for a task; return the winning decision, backups, trace. |
| `advise_spend` | none | Advise whether/how to spend for a task given cost preference + quota. |
| `get_quota` | none | Read the per-provider quota snapshot (tolerant of a missing file). |
| `list_models` | none | Enumerate the merged roster with capability profiles + reachability. |
| `invoke` | `spawn`, `spend` | Execute a task on the best provider (fallback chain); never spends without a signed token. |
| `cancel_invocation` | none | Cancel an in-flight invocation via the per-kind cancellation ladder. |
| `format_handoff` | none | Format a routing decision into a copy-pasteable cli/curl/tools-call command. |
| `set_provider_state` | `write` | Manually override a provider's availability (durably persisted). |

**Config schema** (`plugins.orchestrator-runner.options`): `providers[]` (roster;
canonical home is the root-level `providers` block), `sessionStickinessTtlSeconds`
(default `300`), `defaultCostPreference` (`minimize|balanced|maximize`, default
`balanced`), `invokeTimeoutMs` (default `30000`), `subprocessPoolSize` (default
`2`), `concurrencyLimit` (default `4`), `maxFallbackDepth` (default `3`),
`fallbackStrategy` (`rerank|tier-down`, default `rerank`), `executeApi` (default
`false` — never spends when off), `confirmBeforeExecute` (default `true`),
`autoBypassConfirmed` (default `false`), `dependencies` (injected cross-plugin
seams, e.g. the shared loop detector). Each provider carries `id`, `kind`
(`api|subscription|cli|mcp-server`), `invoke` (kind-specific; `api` references its
key by `envVar` **name**, never a cleartext key), `modelId`, `contextWindow`,
`costTier` (`1`–`5`), `strengths[]`, `weaknesses[]`.

**Cache layout**: all state under `${cacheDir}/orchestrator-runner/`
(workspace-scoped, gitignored; writes go through `withFileMutex` +
`writeFileAtomic` after `redactSecrets`). `healthcheck.json` — availability
snapshot for next-boot recovery (the hot path reads the in-memory mirror, never
this file); `quotas.json` — quota snapshot.

**Dependencies**: hard `dependsOn` `usage-tracking` — the loader refuses the batch
when `usage-tracking` is not also loaded (every advised/executed decision must be
recorded). Reuses the single loop detector from the `proposals` plugin via an
injected seam (`ctx.options.dependencies.loopDetector`), never a second detector
or a cross-plugin import.

**Kill switch**: opt-in (in no preset). The runner does not load unless you name
it. Disable it by omitting it from `--plugins` and from the config's `plugins`
map, or force it off with `--exclude-plugins=orchestrator-runner` (matched against
the resolved plugin name). Do **not** try `options.enabled: false`: the plugin's
option schema is `.strict()`, so an unknown key makes the whole options parse fail
and silently fall back to empty defaults (dropping your roster) rather than
disabling the plugin.

### usage-tracking

The observability plugin: it records **every** tool invocation across every
loaded plugin to an append-only NDJSON log under the cache dir (metadata only —
message content is never written, and each record is piped through `redactSecrets`
first), and surfaces aggregate usage + cost rollups by provider, plugin, agent and
extension.

**Public tools** (2):

| Tool | Effects | Purpose |
|---|---|---|
| `usage_report` | none | Totals + bucketed rollup for the chosen axis (`provider\|plugin\|agent\|extension`) + top-10 most expensive calls. |
| `usage_clear` | `write`, `destructive` | Truncate the log + summary; requires `confirm: true`. |

**Config schema** (`plugins.usage-tracking.options`): `clientMap`
(`clientInfo.name` → `{kind, extension}` overrides for unknown hosts), `maxBatch`
(default `64` — records buffered before a forced flush), `maxDelayMs` (default
`250` — max ms a record waits before a flush), `windowDays` (default `7` — rollup
window), `summaryIntervalMs` (default `300000` — how often the summary is
regenerated).

**Cache layout**: all state under `${cacheDir}/usage-tracking/`.
`invocations.jsonl` — the append-only log (coalesced appends via `appendFile`
under a shared `withFileMutex`, never a read-modify-write); `usage-summary.json` —
the periodic rollup bucketed by provider/plugin/agent/extension;
`pricing.json` — LiteLLM pricing refreshed with a 24h TTL (stale-while-revalidate,
1s hard timeout, bundled snapshot as fallback).

**Dependencies**: none — it is a standalone recorder. It is, however, the hard
dependency of `orchestrator-runner` (above).

**Kill switch**: opt-in (in no preset). Disable it by omitting it from
`--plugins` and from the config's `plugins` map, or force it off with
`--exclude-plugins=usage-tracking`. (There is no `options.enabled` flag; omission
is the switch.)

## Composing third-party MCP servers (opt-in)

### external-mcps

The composition plugin (`@mcp-vertex/external-mcps`): it lets a workspace
**compose published third-party MCP servers** alongside the mcp-vertex-native
plugins, under a strict `ext.<server>.<tool>` namespace, with **lazy subprocess
boot**, an **LLM-assisted config flow**, and a **mandatory human ack** before any
external server runs. It is **opt-in** (in no preset) and **token-lean by
design**: it contributes **zero system-prompt bytes** beyond its ~6 tool
one-liners — nothing about the catalog rides in the prompt. A session that never
composes an external server pays nothing; discovery is one compact `catalog`
call away.

**Public tools** (6, all namespace-qualified as `<prefix>_<id>`):

| Tool | Effects | Purpose |
|---|---|---|
| `catalog` | none | Search the curated + discoverable seed catalog (compact `{id, category, summary}` rows, `total` count; `detail:<id>` for one full entry). Read-only + offline. |
| `suggest` | none | Turn a free-text `need` into ≤3 candidates + an RFC 6902 JSON Patch that ADDS them to the config. Never writes. |
| `validate_config` | none | Dry-run a proposed servers block against the Zod schema (exact version pins, kebab ids, env NAMES only). Never writes or boots. |
| `ack` | `write` | Record/list human acks for LLM-decided activation (durable, redacted, one entry per server). The human gate. |
| `status` | none | Report the lazy subprocess registry state (declared vs booted, pid, last boot error). Never boots or stops. |
| `call` | `spawn`, `write` | Invoke `ext.<server>.<tool>`; boots the server lazily on first call, contained to the workspace, results redacted; blocked until human-acked when required. |

**Token-lean catalog-on-demand design**: the catalog lives on disk in two tiers
— **curated** (a small high-signal set) and **discoverable** (representative
breadth) — and is **never** returned whole. `catalog` caps a list at 10 matches
with a real `total`, so the LLM narrows `query` instead of paging. Detection
rules (e.g. an Angular workspace, probed via
`package.json#dependencies['@angular/core']`) only **annotate** matching entries
with `detected: true`; detection is a hint and **never** activates a server.

**The ack flow**: with `requireHumanAckWhenLlmDecides: true` (default), an
LLM-decided activation is **blocked** until a human records an accepted `ack`.
`suggest` → `validate_config` → apply patch on user confirm → `ack` →
`call`. Each step before `call` is offline and reversible.

**Config schema** (`plugins.external-mcps.options`): `servers` (record keyed by
kebab-case id → `{ version` (mandatory **exact** semver pin — `latest` and
ranges are rejected), `command`, `args`, `namespacePrefix?`, `detect?`, `env?`
(variable **NAMES** only, never cleartext) `}`), plus the three autonomy knobs
`llmDecidesActivation` (default `true`), `requireHumanAckWhenLlmDecides` (default
`true`), `allowDiscoverySearch` (default `false` — the live npm/GitHub kill
switch stays off until you opt in).

**Secrets by name**: env entries in the config are variable **NAMES** only;
values live in the host/shell secret store and are never written to
`mcp-vertex.config.json`. The schema rejects `NAME=VALUE` assignments and
cleartext-token-looking blobs, and every external result is piped through
`redactSecrets` before anything durable is written.

**Kill switch**: opt-in (in no preset). Disable it by omitting it from
`--plugins` and from the config's `plugins` map, or force it off with
`--exclude-plugins=external-mcps`.

## Rules for great, model-agnostic, low-token plugins

1. **Strict schemas in, structured JSON out.** Don't return prose an LLM has to
   parse — return data. This is what keeps a plugin reliable across models.
2. **Idempotent & deterministic.** Same input → same effect; re-runs are safe.
3. **Namespace everything** with `ctx.namespacePrefix`; never hardcode names.
4. **All state under `ctx.pluginCacheDir`**, all docs under `ctx.pluginDocsDir`.
   Resolve to absolute with `ctx.workspace.resolve(...)`.
5. **Respect `ctx.keepLegacy` for generated durable project files.** The core
   scaffold moves existing targets to `legacy/` before rewriting when this flag
   is true; plugins with similar regeneration flows should offer the same
   preservation contract.
6. **No host imports, no `process.cwd()`.** Everything you need is in `ctx`.
7. **Keep knowledge short and on-demand.** It is loaded per plugin; small,
   precise bodies cost the agent fewer tokens.

## Example plugin

See `plugins/proposals` (`@mcp-vertex/proposals`) for a real plugin: it
derives its paths from `ctx`, exposes `agent_lock` and `task_queue`, and ships
a compact workflow knowledge entry.

## VS Code read-only proposals surface (f00097 S1)

The VS Code proposals board and its detail webview are **read-only**: they
project state the proposals plugin already computes, they never mutate it.
Moving a proposal, claiming a slice, transitioning status, or syncing the
registry stays in the agent / CLI, where `agent_lock` and the transition DFA
enforce ownership. Doing those from a UI would need to coordinate with the
lock manager, the transition DFA, and the worktree gate — none of which the UI
does, and none of which it should.

This whitelist is the **contract** between `f00097` and the proposals plugin.
It is mirrored as `READ_ONLY_TOOLS` / `MUTATING_TOOLS_DENIED` in
`extensions/vscode/src/views/proposals-board-view.ts`; the two must stay in
sync. Names are plugin-qualified suffixes — call sites prepend the host
namespace via `formatToolName(namespacePrefix, suffix)`, so a renamed prefix
never breaks the whitelist. Adding a tool here (or promoting one to the UI)
requires an explicit follow-up proposal.

| Tool (suffix) | Board | Detail | Why it is read-only |
|---|---|---|---|
| `proposals_proposal_board` | yes | yes (per-id) | Lists proposals; derives nothing on disk |
| `proposals_proposal_diagnose` | no | yes | Per-proposal diagnosis; pure read |
| `proposals_compact_status` | yes (locks badge) | yes | Aggregated locks + queue + counts |
| `proposals_state_health` | yes (header chip) | yes | Recovery hints; read-only snapshot |
| `proposals_proposal_stale_list` | yes (badge) | yes | "stale > 7d"; read-only |
| `logs_tail` | no | yes (filtered) | Tool-side-redacted point-in-time tail |
| `proposals_proposal_transition` | **no** | **no** | Mutates status (DFA) |
| `proposals_agent_lock` | **no** | **no** | Mutates write-ownership locks |
| `proposals_close_slice` | **no** | **no** | Mutates slice state |
| `proposals_sync_proposals` | **no** | **no** | Mutates the registry / folders |

The detail webview also surfaces the latest `status_marker_close` line for the
slice owner when `logs_tail` carries it — observational only (no parser, no
enforcement); the host appendix §8.1 contract remains the agent's job.
