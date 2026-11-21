/**
 * `tools/scripts/dev/api/client-pool.ts` — x00100 S1.
 *
 * One persistent MCP stdio client per workspace cwd, shared by every
 * `/api/*` route of the dev preview server. Before this pool each
 * request spawned a FRESH host (full 13-plugin boot), called one tool
 * and killed the process — every section switch in `bun run dev:vscode`
 * paid a complete cold boot, which is exactly the "switching options
 * takes forever" report.
 *
 * Lifecycle:
 * - `leaseClient(cwd)` connects lazily on first use and reuses the live
 *   client afterwards (concurrent first calls share one connect).
 * - Callers that see a call fail MUST `invalidateClient(cwd)` — the
 *   process may have died; the next lease reconnects.
 * - An unref'd sweeper closes clients idle for over 5 minutes so the
 *   dev server never leaks host processes.
 */
import { McpStdioClient } from '@delendai/client/public';

import { resolveMcpStdioSpawn } from './resolve-mcp-spawn';

interface IPooledClient {
	readonly client: McpStdioClient;
	lastUsedAt: number;
}

const pool = new Map<string, Promise<IPooledClient>>();
const IDLE_TTL_MS = 5 * 60_000;
const SWEEP_EVERY_MS = 60_000;

const closeQuietly = async (entry: Promise<IPooledClient>): Promise<void> => {
	try {
		const pooled = await entry;
		await pooled.client.close?.();
	} catch {
		// Already dead — that is the point of closing quietly.
	}
};

/** Lease the shared client for `cwd`, connecting on first use. */
export const leaseClient = async (cwd: string): Promise<McpStdioClient> => {
	const existing = pool.get(cwd);
	if (existing !== undefined) {
		try {
			const pooled = await existing;
			pooled.lastUsedAt = Date.now();
			return pooled.client;
		} catch {
			// The cached connect failed; fall through to a fresh one.
			pool.delete(cwd);
		}
	}
	const created = (async (): Promise<IPooledClient> => {
		const spawn = await resolveMcpStdioSpawn(cwd);
		const client = await McpStdioClient.connect({
			command: spawn.command,
			args: spawn.args,
			cwd,
			stderr: 'pipe',
		});
		return { client, lastUsedAt: Date.now() };
	})();
	pool.set(cwd, created);
	try {
		return (await created).client;
	} catch (error) {
		pool.delete(cwd);
		throw error;
	}
};

/** Drop (and close) the pooled client for `cwd` — call after a failed call. */
export const invalidateClient = async (cwd: string): Promise<void> => {
	const entry = pool.get(cwd);
	if (entry === undefined) return;
	pool.delete(cwd);
	await closeQuietly(entry);
};

/** Test seam: close everything and empty the pool. */
export const closeAllClients = async (): Promise<void> => {
	const entries = [...pool.values()];
	pool.clear();
	await Promise.all(entries.map(closeQuietly));
};

const sweeper = setInterval(() => {
	const now = Date.now();
	for (const [cwd, entry] of pool) {
		void entry
			.then((pooled) => {
				if (now - pooled.lastUsedAt > IDLE_TTL_MS) {
					pool.delete(cwd);
					void pooled.client.close?.().catch(() => undefined);
				}
			})
			.catch(() => pool.delete(cwd));
	}
}, SWEEP_EVERY_MS);
// Never keep the dev server process alive just for the sweeper.
sweeper.unref?.();
