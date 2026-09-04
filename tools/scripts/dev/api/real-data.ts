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
import type { IDashboardAllModels } from '@delendai/client';
import { DashboardService } from '@delendai/client/public';

import { invalidateClient, leaseClient } from './client-pool';

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
								`delendai dashboard call timed out after ${timeoutMs}ms`,
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

// x00100 S1: lease the SHARED per-cwd client instead of spawning a
// fresh host per request (a full plugin boot per section switch was the
// dev preview's dominant latency). On failure invalidate the pooled
// client — its process may have died — and retry once on a fresh one.
const connectAndFetch = async (cwd: string): Promise<IDashboardAllModels> =>
	wrap(async () => {
		const fetchOnce = async (): Promise<IDashboardAllModels> => {
			const client = await leaseClient(cwd);
			const service = new DashboardService({ client });
			return await service.getAllModels();
		};
		try {
			return await fetchOnce();
		} catch {
			await invalidateClient(cwd);
			return await fetchOnce();
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
