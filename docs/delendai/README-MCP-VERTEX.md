# @delendai/core

A **project-agnostic core for building MCP servers**, plus a CLI that loads
**plugins** on demand. The core ships only generic utilities; everything
domain-specific (proposals, swarms, your own tools…) lives in plugins.

Two ideas:

1. **Drop it into any project** and it can analyze the repo, tell you what an
   optimal MCP server would need, and generate it — without you spelling it out
   (the *hybrid bootstrap*: the server recommends and generates content, the
   agent writes the files).
2. **Compose capability with plugins**: register `delendai` once in your editor
   and turn features on with `--plugins=...`. The core knows how to create new
   plugins too (see [PLUGINS-DELENDAI.md](./PLUGINS-DELENDAI.md)).

It is designed to work the same under **any agent or model** (Claude, GPT,
local…): MCP is model-agnostic, tools use strict zod schemas and return
structured JSON, and every operation is deterministic and idempotent.

---

## Install / register

delendai is a stdio MCP server. Every chat client that supports MCP loads
it the same way: a config entry that names the binary, the workspace, and
the plugin set. The shape of the entry varies per client, but the launch
arguments are **identical** — once you decide which plugin set you want,
copy the args verbatim into the client-specific config.

The four clients we actively dogfood today, in priority order:

| Client                       | Config file            | Format                           | Where it lives                                   |
| ---------------------------- | ---------------------- | -------------------------------- | ------------------------------------------------ |
| **GitHub Copilot** (VS Code) | `.vscode/mcp.json`     | JSON with `servers.<name>`       | workspace root (this repo's own setup)           |
| **Cursor**                   | `.vscode/mcp.json`     | same as Copilot                  | workspace root (Cursor reuses the VS Code file)  |
| **Antigravity**              | `.vscode/mcp.json`     | same as Copilot                  | workspace root (Antigravity is built on VS Code) |
| **Claude Code**              | `~/.claude.json`       | JSON with `mcpServers.<name>`    | user home directory                              |
| **Codex**                    | `~/.codex/config.toml` | TOML with `[mcp_servers.<name>]` | user home directory                              |

> **One canonical launch shape, many config files.** The four files above
> all wrap the same `--workspace`, `--config` and `--preset` arguments —
> the only thing that changes is the JSON/TOML wrapping. Edit your
> `delendai.config.json` once and every client picks up the change on
> next start.

Host-project scaffolding uses a shared namespace contract: `namespacePrefix`
controls tool ids (`<prefix>_*`) and `mcpServerName` controls the concrete
editor registration key those generated agent files reference. When a project
adopts delendai into an existing server, pass the real `mcpServerName`
instead of assuming the greenfield default `mcp-project-<prefix>`; this is the
contract behind GitHub issue #52.

### VS Code / GitHub Copilot (`.vscode/mcp.json`)

This is the canonical reference. Other clients reuse the same args:

```jsonc
// .vscode/mcp.json
{
	"servers": {
		"delendai": {
			"type": "stdio",
			"command": "bunx",
			"args": [
				"--package", "@delendai/cli", "delendai", "__serve",
				"--workspace", "${workspaceFolder}",
				"--preset", "swarm"
			]
		}
	}
}
```

The published `delendai __serve` entry point boots the core loader. Plugins
declared in `delendai.config.json` are loaded
automatically; `--preset` adds the curated swarm preset; missing
plugins are skipped with a stderr warning — the rest still load.

If you are consuming delendai as a published package from npm:

```jsonc
// .vscode/mcp.json (consumer-style)
{
	"servers": {
		"delendai": {
			"command": "bunx",
			"args": ["--package", "@delendai/cli", "delendai", "__serve", "--workspace", "${workspaceFolder}", "--preset", "swarm"]
		}
	}
}
```

No plugins? Drop `--preset`. The core still gives you the bootstrap and
scaffolding tools.

### Cursor and Antigravity

Both reuse `.vscode/mcp.json` from the workspace root — no separate file
needed. The args are byte-for-byte identical to the VS Code block above.

### Claude Code (`~/.claude.json`)

Claude Code wraps the same MCP server under a `mcpServers` key instead of
`servers`, and lives in the user's home directory instead of the workspace:

```jsonc
// ~/.claude.json
{
	"mcpServers": {
		"delendai": {
			"command": "bunx",
			"args": [
				"--package", "@delendai/cli", "delendai", "__serve",
				"--workspace", "/absolute/path/to/your/repo",
				"--preset", "swarm"
			]
		}
	}
}
```

> Claude Code does **not** expand `${workspaceFolder}`. Substitute the
> absolute path to the repo. Use `--workspace=$PWD` if you prefer the
> shell to resolve it at launch time.

### Codex (`~/.codex/config.toml`)

Codex uses TOML and lives in the user's home directory. The server key
uses `[mcp_servers.<name>]` (with underscores) and the array of args is a
TOML array:

```toml
# ~/.codex/config.toml
[mcp_servers.delendai]
command = "bunx"
args = [
  "--package", "@delendai/cli", "delendai", "__serve",
  "--workspace", "/absolute/path/to/your/repo",
  "--preset", "swarm",
]
```

### JetBrains / Zed / other IDE hosts

For JetBrains and Zed, implement an `@delendai/<ide>` host adapter
against the `IHostAdapter` interface declared in
[`packages/ui-extension/src/host-adapter.types.ts`](../packages/ui-extension/src/host-adapter.types.ts)
— see [CROSS-IDE.md](./CROSS-IDE.md) for the 5-step recipe. Every other
client picks up the change on next start.

## First run in a new project

If this is the first time you are wiring `delendai` into a repository, start with [CROSS-PROJECT-SETUP.md](./CROSS-PROJECT-SETUP.md). It is the canonical guide for choosing the right preset, writing `delendai.config.json`, and configuring the `issues` plugin for the current GitHub repo without drifting from the documented launch shape.

## Install once for all projects

The CLI can register the same MCP server in the supported global host
configurations so each project does not need a hand-edited MCP file:

```bash
delendai init:global --all
```

Use `--ide=cursor-global,windsurf,claude-desktop,antigravity,zed` to select
global targets. The command is deliberately separate from `init`: it never
writes project-scoped files and rejects project-only ids (`vscode`, `cursor`,
and `claude-code`), unknown ids, and an empty `--ide=` value. Re-running it is
idempotent: the `delendai` entry is merged while unrelated MCP servers and
settings remain untouched.

The currently supported global targets are:

| Id               | Host           | Configuration scope            |
| ---------------- | -------------- | ------------------------------ |
| `cursor-global`  | Cursor         | user home                      |
| `windsurf`       | Windsurf       | user home                      |
| `claude-desktop` | Claude Desktop | platform user application data |
| `antigravity`    | Antigravity    | user home                      |
| `zed`            | Zed            | platform user application data |

The command installs the MCP connection only. Agent behavior remains
host-independent because every MCP-capable model receives the same server
tools and the same canonical bootstrap rules. For project-specific pointer
files, generated agent adapters, skills, or `delendai.config.json`, run
`delendai init` or `delendai init:default` in that project. This distinction matters:
MCP configuration can be global, but instruction-file discovery is still
defined by each host (for example `AGENTS.md`, `CLAUDE.md`, Copilot agent
files, Cursor rules, Codex instructions, or Continue configuration).

## CLI arguments

| Argument                     | Default                  | Purpose                                                                                                                                                                                                      |
| ---------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--plugins=a,b,c`            | _(none)_                 | Plugins to load. Resolved as `@delendai/<name>`, then `mcp-<name>`, then the bare name; a `./path` or `@scope/pkg` is used verbatim. A bad plugin is reported on stderr and skipped — the rest still load. |
| `--preset=NAME`              | _(none)_                 | Curated, additive plugin set merged with `--plugins` (deduped). Presets are defined in the canonical catalog (`minimal`, `standard`, `swarm`, `full`) and rendered on the web presets page.                  |
| `--verbose`                  | off                      | Print the assembly diagnostics (resolved plugins, tool/prompt/resource counts, any load errors) to stderr at startup.                                                                                        |
| `--cacheDir=DIR`             | `.cache/delendai`      | Scratch/state root. Each plugin gets `<cacheDir>/<plugin>`.                                                                                                                                                  |
| `--docsDir=DIR`              | `docs/delendai`        | Human-edited document root (e.g. proposals).                                                                                                                                                                 |
| `--workspace=DIR`            | current dir              | Workspace root all paths resolve against.                                                                                                                                                                    |
| `--name=NAME`                | `delendai`             | Server name advertised over MCP.                                                                                                                                                                             |
| `--prefix=NS`                | `delendai`              | Namespace for the core's own tools (`<NS>_analyze_project`, …).                                                                                                                                              |
| `--config=FILE`              | `delendai.config.json` | Config file with per-plugin values (see below).                                                                                                                                                              |
| `--exclude-plugins=a,b`      | _(none)_                 | Subtract plugins after preset, explicit plugins and config-file plugin declarations are merged.                                                                                                              |
| `--check` / `--doctor`       | —                        | Doctor mode: validate config, resolve/load plugins and print a report (tools/prompts/resources counts, errors) **without** starting the server.                                                              |
| `--mcp-project-create=false` | (on)                     | Disable the first-start project-server blueprint.                                                                                                                                                            |
| `--mcp-project-tests=false`  | (on)                     | Omit tests from the generated blueprint.                                                                                                                                                                     |
| `--<anything>=value`         | —                        | Forwarded to every plugin via `ctx.args`.                                                                                                                                                                    |

```bash
# Diagnose a setup before wiring it into a client:
bunx @delendai/cli --plugins=proposals validate
```

## Passing values to plugins — `delendai.config.json`

For anything beyond the global roots, put a config file at the workspace root
(or point at one with `--config`). Each plugin gets a typed `options` object
(any JSON — nested objects, arrays…) and an optional tool-namespace `prefix`:

```jsonc
{
	"cacheDir": ".cache/delendai",
	"docsDir": "docs/delendai",
	"plugins": {
		"proposals": { "prefix": "work", "options": { "docsDir": "docs/x" } }
	}
}
```

Precedence for shared roots is **explicit CLI flag > config file > default**.
Plugin loading is additive: `--preset`, explicit `--plugins` and
`delendai.config.json#plugins` are merged, deduped, then
`--exclude-plugins` subtracts from the final set. A plugin reads its entry as
`ctx.options` (and its namespace as `ctx.namespacePrefix`). A missing or
malformed file contributes nothing — it never crashes the server.

The compact overview includes a `pluginDiagnostic` block with the requested,
loaded, missing and config-declared plugins. Hosts can call
`<prefix>_overview { "compact": true }` first to confirm the tool surface loaded
from `mcp.json` matches the repo config.

### Precedence — how plugins are resolved

When you wire delendai into any of the chat clients above, the actual
plugin set the server loads is the **union** of four canonical sources,
applied in this exact order:

1. **`--preset=NAME`** — curated plugin set from the catalog (`minimal`,
   `standard`, `swarm`, `full`). Resolved once at startup.
2. **`--plugins=a,b,c`** — explicit plugins the user wants on top of the
   preset (deduped against the preset).
3. **`delendai.config.json#plugins`** — workspace-declared plugins with
   their per-plugin options. Always merged in.
4. **`--exclude-plugins=a,b`** — subtracted last, regardless of source.

Concrete example: this repo's own launch shape

```bash
# .vscode/mcp.json (the checked-in file in this repo)
bunx --package @delendai/cli delendai __serve --workspace . --preset swarm
```

combined with `delendai.config.json#plugins = { docs, search, git,
status-marker, test-convention, quality, audit }` produces the union
`{ docs, search, git, memory, rules, quality, deps, proposals,
notification, status-marker, test-convention, audit }` — the same surface
that `delendai_overview { "compact": true }` reports as `loaded: 12`. If
that number drops, **the config file is wrong or missing, not the client
config** — the client config only wraps the launch arguments.

#### Quick parity check

After starting delendai in any chat client, run the compact overview
inside the chat (or from a terminal with `bun run cli -- overview
--json`). The `pluginDiagnostic` field tells you, in one block:

- `requested` — what every source asked for (preset + plugins + config)
- `loaded` — what the loader actually instantiated
- `missing` — requested plugins that failed to load (name + reason)
- `configPlugins` — what `delendai.config.json` declared

If `loaded` ≠ `requested − missing`, the launch arguments or the
config file are the cause — **not the client wrapper**.

## Built-in tools (always available)

- **`<prefix>_overview`** — cold-start map: server identity, loaded plugins,
  every tool with a one-line summary, knowledge ids, paths and the recommended
  next action. **Call this first** — one low-token round-trip orients any model.
- **`<prefix>_knowledge`** — list knowledge ids/titles, or fetch one by id.
  Lazy: read a doc only when needed.
- **`<prefix>_get_validation_matrix`** — the quality-gate commands per scope
  (how to validate work here), from `delendai.config.json`.
- **`<prefix>_status`** — read-only live runtime status aggregated from every
  registered `IStatusCollector` (the built-in delendai collector with loaded
  plugins + counts, plus any host collector). Returns `{ collectors, errors }`.
- **`<prefix>_analyze_project`** — read-only. Inspects the project and returns a
  structured analysis **plus a recommended server plan** (project type incl.
  python/go/rust/monorepo, tools, plugins, validation commands, detected CI and
  agent configs, and a ready-to-paste `mcp.json`).
- **`<prefix>_plan_mcp_project`** — read-only. Returns an **exhaustive** blueprint
  for a project-specific MCP server (every tool/prompt/skill/agent + tests) and
  the files to write. If a server already exists, the notes explain how to
  integrate it with delendai instead of replacing it. On first start delendai
  writes this blueprint to the cache automatically (disable with
  `--mcp-project-create=false`; omit tests with `--mcp-project-tests=false`).
- **`<prefix>_create_project`** — turns a plan into the files for a
  project-specific server, a **plugin**, or an **MCP client** (`kind: host |
  plugin | client`). Returns the files **for the agent to write**; never touches
  disk.
- **`<prefix>_scaffold`** — generates a single tool / prompt / skill / agent /
  host project / **plugin** from templates. Dry-run by default; never
  overwrites.

Also exposed: knowledge as **MCP resources** (`knowledge://<id>`) and a
**`<prefix>_start`** workflow **prompt** for one-click orientation in clients.
Every tool returns compact JSON with a uniform envelope
(`{ ok, error: { reason, nextAction } }`) so any agent handles results the same.

### The bootstrap flow

```
analyze_project   →   review/edit the plan   →   create_project   →   you write the files   →   register in mcp.json
```

## Use as a library — the escape hatch (`bun i`)

Everything is reusable **without** the MCP/CLI path. Install the package and
import the building blocks directly — server assembly, the project analyzer,
the scaffolder, and (from the proposals plugin) the engines and tool builders.

```bash
bun i @delendai/core @delendai/proposals
```

```ts
// 1) Assemble your own server in code:
import { createMcpProject, createWorkspacePathProvider } from '@delendai/core/public';

const assembled = await createMcpProject({
	metadata: { name: 'mcp-project-acme', version: '0.1.0' },
	namespacePrefix: 'acme',
	workspace: createWorkspacePathProvider(process.cwd()),
	extraTools: [/* your IToolRegistration[] */],
});
await assembled.start(); // stdio

// 2) Run the analyzer / recommender as plain functions:
import { analyzeProject, recommendServerPlan } from '@delendai/core/public';
const analysis = analyzeProject(myFileReader);
const plan = recommendServerPlan(analysis);

// 3) Reuse a plugin's tool builders and engines directly:
import {
	buildAgentLockRegistration,
	runContinueProposal,
	buildSwarmPaths,
} from '@delendai/proposals/public';
```

Each package has a single published import surface: **`<pkg>` (= `<pkg>/public`)**
— the curated, stable API. Everything under `src/lib` is internal and is not
exported from the published package, so it can change without a breaking bump.

That public surface also re-exports the **generated tool-output types**: a
`<Pkg>ToolOutputs` map (MCP tool name → `structuredContent` type) plus a
`<Tool>Output` interface per tool, generated from each tool's Zod `outputSchema`
(`bun run types:generate`). MCP clients can type responses without restating the
schema:

```ts
import type { GitToolOutputs } from '@delendai/git/public';
const status: GitToolOutputs['git_status'] = result.structuredContent;
```

So the same code that powers the MCP server is callable as an ordinary library
from any other repo.

## Packages in this repo

- `packages/core` → **`@delendai/core`** (this package).
- `plugins/proposals` → **`@delendai/proposals`** (proposal store +
  agent locks + task queue; the multi-agent "swarm" coordination layer).
- `plugins/rules` → **`@delendai/rules`** (per-framework ESLint/TS
  presets, per-area detection, enforcement modes; the project's config wins).
- `plugins/memory` → **`@delendai/memory`** (persistent project notes
  for cross-session continuity, minimal tokens).
- `plugins/git` → **`@delendai/git`** (read-only git orientation:
  status / changed / diff / log).
- `plugins/quality` → **`@delendai/quality`** (runs the project quality
  gates per scope and returns structured pass/fail).
- `plugins/search` → **`@delendai/search`** (grep-like, low-token textual
  `search` over allow-listed workspace files).
- `plugins/notification` → **`@delendai/notification`** (watches the
  shared lock file and pushes an MCP `notifications/message` on release, so
  agents stop polling).
- `plugins/docs` → **`@delendai/docs`** (catalogue + read the repo
  markdown: `docs_list` / `docs_read`, anti-traversal).
- `plugins/deps` → **`@delendai/deps`** (dependency inventory + offline
  health: `deps_list` / `deps_check`; no network).

## Design principles (model/agent-agnostic, low-token)

- Strict **zod** input schemas; **structured JSON** outputs (no prose to
  re-interpret per model).
- **Deterministic** tool registration order; **idempotent** operations.
- The core never imports a host package and never calls `process.cwd()` outside
  the CLI entry — plugins receive everything resolved in their context.
- Knowledge is loaded **per plugin**, so an agent only pays for what it uses.

## License

BSD-3-Clause © Cartago
