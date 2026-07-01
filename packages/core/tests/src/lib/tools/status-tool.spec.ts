import { describe, expect, it } from 'vitest';

import { collectStatus } from '@mcp-vertex/core/lib/tools/status-tool';
import type { IStatusCollector } from '@mcp-vertex/core/lib/contracts/interfaces/status-collector.interface';

const collector = (
	id: string,
	collect: () => Promise<Record<string, unknown>>,
): IStatusCollector => ({ id, collect });

describe('collectStatus (IStatusCollector, N23)', async () => {
	it('aggregates every collector keyed by id', async () => {
		const res = await collectStatus([
			collector('engine', async () => ({ loop: 'running', fps: 60 })),
			collector('mcp-vertex', async () => ({ loadedPlugins: ['git'] })),
		]);
		expect(res.collectors.engine).toEqual({ loop: 'running', fps: 60 });
		expect(res.collectors['mcp-vertex']).toEqual({
			loadedPlugins: ['git'],
		});
		expect(res.errors).toEqual([]);
	});

	it('captures a throwing collector without sinking the others', async () => {
		const res = await collectStatus([
			collector('ok', async () => ({ a: 1 })),
			collector('bad', async () => {
				throw new Error('boom');
			}),
		]);
		expect(res.collectors.ok).toEqual({ a: 1 });
		expect(res.collectors.bad).toBeUndefined();
		expect(res.errors).toEqual([{ id: 'bad', error: 'boom' }]);
	});

	it('returns empty for no collectors', async () => {
		expect(await collectStatus([])).toEqual({ collectors: {}, errors: [] });
	});
});
