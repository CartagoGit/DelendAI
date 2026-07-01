import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * Options for {@link gracefulShutdown}.
 *
 * - `timeoutMs`: hard cap on the wait for `server.close()` to resolve.
 *   Defaults to 5s, which is the conventional MCP shutdown window
 *   (matches `McpServer.close()`'s internal drain). After the cap
 *   the helper stops waiting and proceeds to exit anyway, so a
 *   wedged tool handler cannot pin the host alive.
 *
 * - `exitProcess`: when `true` (default) the helper calls
 *   `process.exit(code)` after the close completes. Pass `false`
 *   in tests or in hosts that want to perform additional cleanup
 *   before exiting (the host must then call `process.exit`
 *   itself, or return from `run()` and let `beforeExit` finish it).
 *
 * - `exitCode`: code passed to `process.exit`. The conventional
 *   value for SIGINT/SIGTERM in shells is 128 + signal number
 *   (`130` for SIGINT, `143` for SIGTERM). Pass `0` to indicate
 *   "clean shutdown despite signal" (useful for ops automation
 *   that scrapes exit codes).
 */
export interface IGracefulShutdownOptions {
	readonly timeoutMs?: number;
	readonly exitProcess?: boolean;
	readonly exitCode?: number;
}

const DEFAULT_TIMEOUT_MS = 5_000;

/**
 * Module-local guard: a SIGTERM during shutdown, or a `beforeExit`
 * fire immediately after, must not call `McpServer.close()` twice.
 * The MCP SDK throws on double-close (`McpServer already closed`).
 */
let shuttingDown = false;

/** Test-only: reset the module-local guard between specs. */
export const __resetShutdownGuardForTests = (): void => {
	shuttingDown = false;
};

/**
 * Close an assembled MCP server cleanly and (by default) exit the
 * current process.
 *
 * Designed to be wired to `SIGTERM` / `SIGINT` / `SIGHUP` in host
 * entrypoints (`scripts/host-server.ts` in this repo, any user
 * project that copies `cli.ts`). Calling it manually from a host's
 * own shutdown path is also safe — the guard is idempotent across
 * concurrent invocations.
 *
 * The function does not `throw`: on failure it logs to `stderr`
 * and proceeds to exit with the requested code so the process
 * can never get stuck.
 *
 * @example
 * ```ts
 * const assembled = await createMcpProject(config);
 * await assembled.start();
 *
 * const onSignal = (): void => {
 * 	void gracefulShutdown(assembled.server, { exitCode: 130 });
 * };
 * process.on('SIGTERM', onSignal);
 * process.on('SIGINT', onSignal);
 * process.on('SIGHUP', onSignal);
 * ```
 */
export const gracefulShutdown = async (
	server: McpServer,
	options: IGracefulShutdownOptions = {},
): Promise<void> => {
	if (shuttingDown) {
		// Second invocation from a sibling signal — drop it silently.
		return;
	}
	shuttingDown = true;

	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const exitProcess = options.exitProcess ?? true;
	const exitCode = options.exitCode ?? 0;
	if (exitProcess) {
		process.exitCode = exitCode;
	}

	// Best-effort close with a hard timeout. The MCP SDK's close()
	// awaits in-flight tool handlers; if one is wedged we still want
	// the process to die on schedule.
	let timedOut = false;
	const closePromise = server.close().catch((err: unknown) => {
		process.stderr.write(
			`[mcp-vertex] gracefulShutdown: server.close() rejected: ${
				err instanceof Error ? err.message : String(err)
			}\n`,
		);
	});
	const timeoutPromise = new Promise<void>((resolve) => {
		setTimeout(() => {
			timedOut = true;
			resolve();
		}, timeoutMs).unref();
	});

	await Promise.race([closePromise, timeoutPromise]);

	if (timedOut) {
		process.stderr.write(
			`[mcp-vertex] gracefulShutdown: server.close() did not complete within ${timeoutMs}ms; exiting anyway\n`,
		);
	}

	if (exitProcess) {
		// process.exit is intentional here: this helper is the LAST
		// thing a host does before it terminates. Any further work
		// belongs in the caller (after awaiting this function with
		// exitProcess: false).
		process.exit(exitCode);
	}
};
