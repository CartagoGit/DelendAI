import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import plugin from '../../../src/index';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe('external MCP configuration metadata', () => {
	it('publishes each child options, safe schema and example through activation', async () => {
		const root = mkdtempSync(join(tmpdir(), 'mcpv-ext-metadata-'));
		roots.push(root);
		const server = {
			enabled: false,
			version: '1.2.3',
			command: 'npx',
			args: ['-y', '@example/server@1.2.3'],
			env: ['EXAMPLE_TOKEN'],
		};
		const registrations = await plugin.register({
			options: { servers: { demo: server } },
			args: {},
			namespacePrefix: 'external-mcps',
			pluginCacheDir: 'external-mcps',
			cacheDir: '.cache/mcp-vertex',
			docsDir: 'docs/mcp-vertex',
			workspace: {
				root,
				resolve: (relative: string) => join(root, relative),
			},
		} as never);

		const contribution = registrations.activation?.[0];
		expect(contribution).toMatchObject({
			id: 'ext.demo',
			origin: 'external',
			configuration: { options: server, configExample: server },
		});
		expect(
			contribution?.configuration?.optionsSchema?.safeParse(server)
				.success,
		).toBe(true);
		expect(
			contribution?.configuration?.optionsSchema?.safeParse({
				...server,
				env: ['TOKEN=cleartext'],
			}).success,
		).toBe(false);
	});
});
