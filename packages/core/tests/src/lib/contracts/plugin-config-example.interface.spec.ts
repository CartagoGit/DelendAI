/**
 * `IPluginConfigExample` contract guard (l100 s6).
 *
 * Pins the shape so future refactors cannot silently drop the
 * `summary` or `options` fields. The interface is opt-in (plugins
 * without it simply skip the Configuration section on the docs
 * site), so the spec does NOT pin "every plugin must have one" — it
 * just pins the shape of those that do.
 */
import { describe, expect, it } from 'vitest';

import type { IPluginConfigExample } from '@mcp-vertex/core/public';

describe('IPluginConfigExample', async () => {
	it('accepts a minimal example (only required fields)', async () => {
		const ex: IPluginConfigExample = {
			summary: 'Enable the swarm proposal workflow.',
			options: {},
		};
		expect(ex.summary).toBeTypeOf('string');
		expect(ex.options).toEqual({});
		expect(ex.example).toBeUndefined();
	});

	it('accepts a machine-readable example alias for consumers', async () => {
		const ex: IPluginConfigExample = {
			summary: 'Enable the swarm proposal workflow.',
			example: { validationCommand: 'bun run validate' },
			options: { validationCommand: 'bun run validate' },
		};
		expect(ex.example).toEqual({ validationCommand: 'bun run validate' });
	});

	it('accepts an example with arbitrary nested config', async () => {
		const ex: IPluginConfigExample = {
			summary: 'Tune the swarm timeout.',
			options: {
				defaultSliceGate: 'lint',
				namePool: ['falcon', 'owl'],
				notify: { onRelease: true },
			},
		};
		expect(ex.options.namePool).toEqual(['falcon', 'owl']);
	});
});
