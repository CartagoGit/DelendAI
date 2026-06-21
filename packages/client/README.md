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
