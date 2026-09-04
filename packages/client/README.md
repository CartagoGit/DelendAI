# @delendai/client

IDE-agnostic TypeScript client for talking to an `delendai` server over
MCP stdio. It spawns the server as a child process, speaks the MCP
protocol over its stdin/stdout, and exposes a small, typed surface
(`request`, `listTools`) plus higher-level services (overview, knowledge,
metrics, memory, search, dashboard, …) built on top of that transport.
Use it from any external host — a VS Code extension, a CLI, a web
backend — that needs to drive an `delendai` server programmatically
instead of through an LLM agent.

## Install

```sh
bun add @delendai/client
```

## Usage

```ts
import { McpStdioClient } from '@delendai/client/public';

const client = await McpStdioClient.connect({
	command: 'bun',
	args: ['run', 'scripts/host-server.ts', '--preset=swarm'],
	cwd: '/path/to/your/workspace',
});

const tools = await client.listTools();
console.log(tools.map((t) => t.name));

const result = await client.request('delendai_overview', { compact: true });
console.log(result);
```

`McpStdioClient.connect` spawns the server and performs the MCP
handshake; `request` calls a tool by name and returns its
`structuredContent` (throwing `McpToolError` when the tool reports
`isError`). Pass `stderr: 'pipe'` in tests so the server's status banners
don't leak into your test output.

## Services

Beyond the raw transport, the package's public surface
(`packages/client/src/public/index.ts`) exports higher-level services that
wrap common host needs: `OverviewService`, `KnowledgeService`,
`MetricsService`, `MemoryService`, `SearchService`, `NotificationsService`,
`HealthService`, `ConnectionHealthService`, `DashboardService`,
`SettingsService`, `LogsService` and `EmbedService`. Each takes an
`IMcpTransport`-compatible client (so it works with `McpStdioClient` or any
other transport implementing `IMcpTransport`) and exposes a typed,
documented method per use case instead of raw `request` calls.

See [`src/public/index.ts`](./src/public/index.ts) for the full exported
surface — that barrel is the only stable import path; everything under
`src/lib` may change without notice.

## Namespace-aware services (f00081)

The host namespaces every tool as `<prefix><suffix>` — `delendai_overview`,
`delendai_metrics`, and so on. The default prefix is `delendai_`, but a
deployment started with `--prefix=acme` (a valid `assemble` flag) namespaces
every tool as `acme_overview`, `acme_metrics`, … If a service hardcoded the
default prefix, every call against such a server would fail immediately.

The prefix flows like this:

1. The server reports its prefix via `delendai_overview { compact: true }`
   (the `namespacePrefix` field of the result).
2. The caller (host extension, IDE plugin, CLI) reads that prefix from its
   own boot config and passes it to each service constructor.
3. Every `request(...)` call is composed with `formatToolName(prefix, suffix)`,
   so the tool name is always namespaced correctly.

Pass the prefix as the second constructor argument (or, for
`DashboardService`, as the `namespacePrefix` option). Omitting it keeps the
default `delendai_` behaviour bit-for-bit:

```ts
import {
  OverviewService,
  DashboardService,
  formatToolName,
} from '@delendai/client';

// Default prefix → calls `delendai_overview`.
const overview = new OverviewService(client);

// Custom prefix → calls `acme_overview`.
const acmeOverview = new OverviewService(client, 'acme');

// DashboardService takes the prefix as an option.
const dashboard = new DashboardService({ client, namespacePrefix: 'acme' });

// The shared helper that every service uses internally is also exported:
formatToolName('acme', 'overview'); // → 'acme_overview'
formatToolName(undefined, 'overview'); // → 'delendai_overview'
```

`OverviewService`, `NotificationsService`, `ConnectionHealthService` and
`DashboardService` accept the prefix today; `formatToolName` and
`parsePrefix` (which applies the `prefix ?? 'delendai_'` default) are
exported for any consumer that needs to namespace a tool name by hand.

## Scaffold a plugin from a script (f00087)

For projects that want to scaffold a new `IMcpPlugin` outside an MCP
session — for example, to bootstrap a private plugin without spinning
up a host — the client re-exports the pure generators from
`@delendai/core/public` plus a `writeScaffoldedFiles` helper that
applies them atomically with the same `keepLegacy` semantics the MCP
scaffold tool uses:

```ts
import {
  scaffoldPluginFiles,
  writeScaffoldedFilesOrThrow,
} from '@delendai/client';

const files = scaffoldPluginFiles({
  pluginName: 'demo',
  description: 'A demo plugin',
});
const result = await writeScaffoldedFilesOrThrow(
  './libs/plugins/demo',
  files,
);
```

For a one-shot CLI flow, run the root-level helper instead:

```sh
bun run plugin:create demo -- "A demo plugin"
```

The script writes the four canonical files (`package.json`,
`src/index.ts`, `tsconfig.json`, `README.md`) flat under
`./libs/plugins/demo/` relative to the current working directory
(`scaffoldPluginFiles` produces `plugins/<name>/...` paths because it
assumes a workspace-root install; the script strips that prefix so
the CLI output is the cleaner `libs/plugins/demo/` shape). Pass
`--keep-legacy` to move existing files aside instead of refusing to
overwrite them.

## Create or repair a project plugin in process

The public client also provides `createProjectPlugin` for generating a declarative
plugin and registering its module path in the workspace configuration:

```ts
import { createProjectPlugin, repairProjectPlugin } from '@delendai/client';

const spec = {
  name: 'notes',
  description: 'Project notes',
  tools: [{ id: 'add', description: 'Add a note' }],
};

await createProjectPlugin(spec, { workspaceRoot: '/path/to/project' });
await repairProjectPlugin(spec, { workspaceRoot: '/path/to/project' });
```

Without an explicit `pluginsRoot`, the default layout is
`packages/delendai/plugins/delendai_<plugin-id>` relative to the
workspace. `repairProjectPlugin` recreates missing generated files, preserves
existing files, repairs `plugins.<id>.path`, and returns an actionable report.
MCP tool and CLI surfaces are intentionally deferred to a separate slice.
