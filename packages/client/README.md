# @mcp-vertex/client

IDE-agnostic TypeScript client for talking to an `mcp-vertex` server over
MCP stdio. It spawns the server as a child process, speaks the MCP
protocol over its stdin/stdout, and exposes a small, typed surface
(`request`, `listTools`) plus higher-level services (overview, knowledge,
metrics, memory, search, dashboard, …) built on top of that transport.
Use it from any external host — a VS Code extension, a CLI, a web
backend — that needs to drive an `mcp-vertex` server programmatically
instead of through an LLM agent.

## Install

```sh
bun add @mcp-vertex/client
```

## Usage

```ts
import { McpStdioClient } from '@mcp-vertex/client/public';

const client = await McpStdioClient.connect({
	command: 'bun',
	args: ['run', 'scripts/host-server.ts', '--preset=swarm'],
	cwd: '/path/to/your/workspace',
});

const tools = await client.listTools();
console.log(tools.map((t) => t.name));

const result = await client.request('mcpvertex_overview', { compact: true });
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

## Scaffold a plugin from a script (f00087)

For projects that want to scaffold a new `IMcpPlugin` outside an MCP
session — for example, to bootstrap a private plugin without spinning
up a host — the client re-exports the pure generators from
`@mcp-vertex/core/public` plus a `writeScaffoldedFiles` helper that
applies them atomically with the same `keepLegacy` semantics the MCP
scaffold tool uses:

```ts
import {
  scaffoldPluginFiles,
  writeScaffoldedFilesOrThrow,
} from '@mcp-vertex/client';

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
