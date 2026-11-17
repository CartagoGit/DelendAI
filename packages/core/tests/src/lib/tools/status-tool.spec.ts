import { describe, expect, it } from 'vitest';
import { createFakeToolServer } from '@delendai/test-kit';

import {
	buildStatusToolRegistration,
	collectStatus,
} from '@delendai/core/lib/tools/status-tool';
import type { IStatusCollector } from '@delendai/core/lib/contracts/interfaces/status-collector.interface';

const collector = (
	id: string,
	collect: () => Promise<Record<string, unknown>>,
): IStatusCollector => ({ id, collect });

describe('collectStatus (IStatusCollector, N23)', async () => {
	it('aggregates every collector keyed by id', async () => {
		const res = await collectStatus([
			collector('engine', async () => ({ loop: 'running', fps: 60 })),
			collector('delendai', async () => ({ loadedPlugins: ['git'] })),
		]);
		expect(res.collectors.engine).toEqual({ loop: 'running', fps: 60 });
		expect(res.collectors.delendai).toEqual({
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

describe('the status tool runtime fields [<50ms]', () => {
	it('returns the runtime state with its summary, declared in the outputSchema', async () => {
		let config:
			| { outputSchema: { shape: Record<string, unknown> } }
			| undefined;
		let handler: ((args: unknown) => unknown) | undefined;
		await buildStatusToolRegistration('delendai', [], () => ({
			kind: 'branch',
			branch: 'develop',
			sha12: 'abcdef123456',
			ahead: 0,
			behind: 2,
			dirty: false,
		})).register(
			createFakeToolServer({
				onRegisterTool: (tool) => {
					config = tool.config as typeof config;
					handler = tool.handler;
				},
			}),
		);
		expect(Object.keys(config?.outputSchema.shape ?? {})).toContain(
			'runtime',
		);
		expect(JSON.stringify(await handler?.({}))).toContain(
			'develop@abcdef123456 behind 2',
		);
	});
});
