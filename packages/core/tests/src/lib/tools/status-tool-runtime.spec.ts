import { describe, expect, it } from 'vitest';

import { createFakeToolServer } from '@delendai/test-kit';

import { buildStatusToolRegistration } from '@delendai/core/lib/tools/status-tool';

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
