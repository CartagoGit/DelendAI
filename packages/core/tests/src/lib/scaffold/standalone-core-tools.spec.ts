import { createFakeToolServer } from '@delendai/test-kit';
import { describe, expect, it } from 'vitest';

import { buildStandaloneCoreToolRegistrations } from '../../../../src/lib/scaffold/standalone-core-tools';
import { DELENDAI_VERSION } from '../../../../src/lib/version';

const options = {
	namespacePrefix: 'acme',
	workspace: {
		root: '/tmp/acme',
		resolve: (path: string) => `/tmp/acme/${path}`,
	},
	projectName: 'Acme',
	projectPackageName: 'acme',
} as const;

/** The text the overview handler answers, taken through a capturing fake server. */
const overviewText = async (
	overrides: { serverName?: string; serverVersion?: string } = {},
): Promise<string> => {
	const [overview] = buildStandaloneCoreToolRegistrations({
		...options,
		...overrides,
	});
	let handler: ((args: unknown) => unknown) | undefined;
	await overview?.register(
		createFakeToolServer({
			onRegisterTool: (registered) => {
				handler = registered.handler;
			},
		}),
	);
	return JSON.stringify(await handler?.({}));
};

describe('buildStandaloneCoreToolRegistrations', () => {
	it('registers the overview first, then the bootstrap and scaffold tools', () => {
		const tools = buildStandaloneCoreToolRegistrations(options);
		expect(tools[0]?.id).toBe('overview');
		expect(tools.length).toBeGreaterThan(2);
		expect(tools.at(-1)?.id).toBe('scaffold');
	});

	it('names the server after the prefix and versions it as core is published', async () => {
		const text = await overviewText();
		expect(text).toContain('acme-mcp-server');
		expect(text).toContain(DELENDAI_VERSION);
	});

	it('honours an explicit server identity', async () => {
		const text = await overviewText({
			serverName: 'custom',
			serverVersion: '9.9.9',
		});
		expect(text).toContain('custom');
		expect(text).toContain('9.9.9');
	});
});
