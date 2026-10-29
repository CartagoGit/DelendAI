import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * An assembled (but not yet connected) MCP server. `start()` connects
 * the stdio transport; `registrationOrder` exposes the exact tool
 * registration sequence for audits and tests.
 *
 * Declared here rather than beside `createMcpProject` because
 * `@delendai/core/contracts` re-exports it, and resolving a type makes
 * TypeScript check the entire target module: re-exporting this from
 * `lib/project/create-mcp-project.ts` pulled in `tool-surface-runtime`
 * and through it `node:async_hooks`, breaking any consumer compiling
 * without `@types/node`.
 */
export interface IDelendaiProject {
	readonly server: McpServer;
	readonly registrationOrder: readonly string[];
	start(): Promise<void>;
	/**
	 * Idempotent teardown (r00039 / AUD-E02): waits (bounded) for any
	 * in-flight lazily-activated tool invocation to drain, then disposes
	 * every plugin runtime this project activated — eager or lazy,
	 * whichever ran — in reverse activation order. Safe to call more
	 * than once, and safe to call even if `start()` was never invoked.
	 * Does not close the transport itself; wire `SIGTERM`/`SIGINT` to
	 * this alongside `gracefulShutdown(server)` (see `run-cli.ts`).
	 */
	dispose(): Promise<void>;
}
