/**
 * `tools/scripts/dev/api/real-data.ts` — server-side fetch of a real
 * `IDashboardAllModels` from the MCP server, for the dev preview.
 *
 * The browser bundle (`extensions/vscode/src/dev/entry.ts`) cannot
 * itself import the MCP stdio client (it would re-introduce the
 * cross-spawn → child_process chain we proved fragile in the earlier
 * slices). The dev server runs in Bun (Node-like), so it CAN spawn the
 * MCP stdio client safely. This module is the server-side half: it
 * connects to the server, calls the dashboard aggregator, and returns
 * the snapshot as JSON.
 *
 * The browser hits `GET /api/dashboard` and renders whatever this
 * returns through `renderDashboard(model, …)`. If the MCP server is not
 * reachable, we throw a structured `IApiError` that the browser shows
 * inside the setup wizard (rather than a 500).
 */
import type { IDashboardAllModels } from '@mcp-vertex/client';
import { DashboardService } from '@mcp-vertex/client/public';
import { McpStdioClient } from '@mcp-vertex/client/public';

import { resolveMcpStdioSpawn } from './resolve-mcp-spawn';

/** Server-side error envelope surfaced to the browser. */
export interface IApiError {
	readonly ok: false;
	readonly kind: 'probe-failed' | 'spawn-failed' | 'tool-failed' | 'timeout';
	readonly message: string;
	readonly durationMs: number;
}

const wrap = async <T>(
	factory: () => Promise<T>,
	kind: IApiError['kind'],
	timeoutMs = 8000,
): Promise<T> => {
	const start = Date.now();
	const timer = setTimeout(() => undefined, timeoutMs); // noop safety
	try {
		return await Promise.race([
			factory(),
			new Promise<never>((_, reject) =>
				setTimeout(
					() =>
						reject(
							new Error(
								`mcp-vertex dashboard call timed out after ${timeoutMs}ms`,
							),
						),
					timeoutMs,
				),
			),
		]);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		throw {
			ok: false,
			kind,
			message,
			durationMs: Date.now() - start,
		} satisfies IApiError;
	} finally {
		clearTimeout(timer);
	}
};

const connectAndFetch = async (cwd: string): Promise<IDashboardAllModels> =>
	wrap(async () => {
		const spawn = await resolveMcpStdioSpawn(cwd);
		const client = await McpStdioClient.connect({
			command: spawn.command,
			args: spawn.args,
			cwd,
			stderr: 'pipe',
		});
		try {
			const service = new DashboardService({ client });
			return await service.getAllModels();
		} finally {
			await client.close?.().catch(() => undefined);
		}
	}, 'tool-failed');

export const fetchRealDashboard = async (
	cwd: string,
): Promise<IDashboardAllModels | IApiError> => {
	try {
		return await connectAndFetch(cwd);
	} catch (err) {
		if (err && typeof err === 'object' && 'ok' in err)
			return err as IApiError;
		return {
			ok: false,
			kind: 'spawn-failed',
			message: err instanceof Error ? err.message : String(err),
			durationMs: 0,
		};
	}
};
