# @mcp-vertex/core

A **project-agnostic core for building MCP servers**, plus a CLI that loads
**plugins** on demand. The core ships only generic utilities; everything
domain-specific (proposals, swarms, your own tools…) lives in plugins.

Two ideas:

1. **Drop it into any project** and it can analyze the repo, tell you what an
   optimal MCP server would need, and generate it — without you spelling it out
   (the *hybrid bootstrap*: the server recommends and generates content, the
   agent writes the files).
2. **Compose capability with plugins**: register `mcp-vertex` once in your editor
   and turn features on with `--plugins=...`. The core knows how to create new
   plugins too (see [PLUGINS-MCP-VERTEX.md](./PLUGINS-MCP-VERTEX.md)).

It is designed to work the same under **any agent or model** (Claude, GPT,
local…): MCP is model-agnostic, tools use strict zod schemas and return
structured JSON, and every operation is deterministic and idempotent.

---

## Install / register

Register the core once in your MCP client (VS Code, Cursor, Claude…):

```jsonc
// .vscode/mcp.json
{
	"servers": {
		"mcp-vertex": {
			"command": "bunx",
			"args": ["@mcp-vertex/core", "--plugins=proposals"]
		}
	}
}
```

No plugins? Drop `--plugins`. The core still gives you the bootstrap and
scaffolding tools.

## CLI arguments

| Argument | Default | Purpose |
|---|---|---|
| `--plugins=a,b,c` | _(none)_ | Plugins to load. Resolved as `@mcp-vertex/<name>`, then `mcp-<name>`, then the bare name; a `./path` or `@scope/pkg` is used verbatim. A bad plugin is reported on stderr and skipped — the rest still load. |
| `--preset=NAME` | _(none)_ | Curated, additive plugin set merged with `--plugins` (deduped): `minimal` (git, search), `standard` (git, search, memory, docs, rules, quality, deps), `swarm` (standard + proposals, notification). |
| `--verbose` | off | Print the assembly diagnostics (resolved plugins, tool/prompt/resource counts, any load errors) to stderr at startup. |
| `--cacheDir=DIR` | `.cache/mcp-vertex` | Scratch/state root. Each plugin gets `<cacheDir>/<plugin>`. |
| `--docsDir=DIR` | `docs/mcp-vertex` | Human-edited document root (e.g. proposals). |
| `--workspace=DIR` | current dir | Workspace root all paths resolve against. |
| `--name=NAME` | `mcp-vertex` | Server name advertised over MCP. |
| `--prefix=NS` | `mcpcore` | Namespace for the core's own tools (`<NS>_analyze_project`, …). |
| `--config=FILE` | `mcp-vertex.config.json` | Config file with per-plugin values (see below). |
| `--check` / `--doctor` | — | Doctor mode: validate config, resolve/load plugins and print a report (tools/prompts/resources counts, errors) **without** starting the server. |
| `--mcp-server-create=false` | (on) | Disable the first-start project-server blueprint. |
| `--mcp-server-tests=false` | (on) | Omit tests from the generated blueprint. |
| `--<anything>=value` | — | Forwarded to every plugin via `ctx.args`. |

```bash
# Diagnose a setup before wiring it into a client:
bunx @mcp-vertex/core --plugins=proposals --check
```

## Passing values to plugins — `mcp-vertex.config.json`

For anything beyond the global roots, put a config file at the workspace root
(or point at one with `--config`). Each plugin gets a typed `options` object
(any JSON — nested objects, arrays…) and an optional tool-namespace `prefix`:

```jsonc
{
	"cacheDir": ".cache/mcp-vertex",
	"docsDir": "docs/mcp-vertex",
	"plugins": {
		"proposals": { "prefix": "work", "options": { "docsDir": "docs/x" } }
	}
}
```

Precedence for the shared roots is **explicit CLI flag > config file > default**.
A plugin reads its entry as `ctx.options` (and its namespace as
`ctx.namespacePrefix`). A missing or malformed file contributes nothing — it
never crashes the server.

## Built-in tools (always available)

- **`<prefix>_overview`** — cold-start map: server identity, loaded plugins,
  every tool with a one-line summary, knowledge ids, paths and the recommended
  next action. **Call this first** — one low-token round-trip orients any model.
- **`<prefix>_knowledge`** — list knowledge ids/titles, or fetch one by id.
  Lazy: read a doc only when needed.
- **`<prefix>_get_validation_matrix`** — the quality-gate commands per scope
  (how to validate work here), from `mcp-vertex.config.json`.
- **`<prefix>_status`** — read-only live runtime status aggregated from every
  registered `IStatusCollector` (the built-in mcp-vertex collector with loaded
  plugins + counts, plus any host collector). Returns `{ collectors, errors }`.
- **`<prefix>_analyze_project`** — read-only. Inspects the project and returns a
  structured analysis **plus a recommended server plan** (project type incl.
  python/go/rust/monorepo, tools, plugins, validation commands, detected CI and
  agent configs, and a ready-to-paste `mcp.json`).
- **`<prefix>_plan_mcp_server`** — read-only. Returns an **exhaustive** blueprint
  for a project-specific MCP server (every tool/prompt/skill/agent + tests) and
  the files to write. If a server already exists, the notes explain how to
  integrate it with mcp-vertex instead of replacing it. On first start mcp-vertex
  writes this blueprint to the cache automatically (disable with
  `--mcp-server-create=false`; omit tests with `--mcp-server-tests=false`).
- **`<prefix>_create_server`** — turns a plan into the files for a
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
analyze_project   →   review/edit the plan   →   create_server   →   you write the files   →   register in mcp.json
```

## Use as a library — the escape hatch (`bun i`)

Everything is reusable **without** the MCP/CLI path. Install the package and
import the building blocks directly — server assembly, the project analyzer,
the scaffolder, and (from the proposals plugin) the engines and tool builders.

```bash
bun i @mcp-vertex/core @mcp-vertex/proposals
```

```ts
// 1) Assemble your own server in code:
import { createMcpServer, createWorkspacePathProvider } from '@mcp-vertex/core/public';

const assembled = await createMcpServer({
	metadata: { name: 'mcp-server-acme', version: '0.1.0' },
	namespacePrefix: 'acme',
	workspace: createWorkspacePathProvider(process.cwd()),
	extraTools: [/* your IToolRegistration[] */],
});
await assembled.start(); // stdio

// 2) Run the analyzer / recommender as plain functions:
import { analyzeProject, recommendServerPlan } from '@mcp-vertex/core/public';
const analysis = analyzeProject(myFileReader);
const plan = recommendServerPlan(analysis);

// 3) Reuse a plugin's tool builders and engines directly:
import {
	buildAgentLockRegistration,
	runContinueProposal,
	buildSwarmPaths,
} from '@mcp-vertex/proposals/public';
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
import type { GitToolOutputs } from '@mcp-vertex/git/public';
const status: GitToolOutputs['git_status'] = result.structuredContent;
```

So the same code that powers the MCP server is callable as an ordinary library
from any other repo.

## Packages in this repo

- `packages/core` → **`@mcp-vertex/core`** (this package).
- `plugins/proposals` → **`@mcp-vertex/proposals`** (proposal store +
  agent locks + task queue; the multi-agent "swarm" coordination layer).
- `plugins/rules` → **`@mcp-vertex/rules`** (per-framework ESLint/TS
  presets, per-area detection, enforcement modes; the project's config wins).
- `plugins/memory` → **`@mcp-vertex/memory`** (persistent project notes
  for cross-session continuity, minimal tokens).
- `plugins/git` → **`@mcp-vertex/git`** (read-only git orientation:
  status / changed / diff / log).
- `plugins/quality` → **`@mcp-vertex/quality`** (runs the project quality
  gates per scope and returns structured pass/fail).
- `plugins/search` → **`@mcp-vertex/search`** (grep-like, low-token textual
  `search` over allow-listed workspace files).
- `plugins/notification` → **`@mcp-vertex/notification`** (watches the
  shared lock file and pushes an MCP `notifications/message` on release, so
  agents stop polling).
- `plugins/docs` → **`@mcp-vertex/docs`** (catalogue + read the repo
  markdown: `docs_list` / `docs_read`, anti-traversal).
- `plugins/deps` → **`@mcp-vertex/deps`** (dependency inventory + offline
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
