/**
 * `IPluginConfigExample` contract guard (p100 s6).
 *
 * Pins the shape so future refactors cannot silently drop the
 * `summary` or `options` fields. The interface is opt-in (plugins
 * without it simply skip the Configuration section on the docs
 * site), so the spec does NOT pin "every plugin must have one" — it
 * just pins the shape of those that do.
 */
import { describe, expect, it } from 'vitest';

import type { IPluginConfigExample } from '@mcp-vertex/core/public';

describe('IPluginConfigExample', () => {
	it('accepts a minimal example (only required fields)', () => {
		const ex: IPluginConfigExample = {
			summary: 'Enable the swarm proposal workflow.',
			options: {},
		};
		expect(ex.summary).toBeTypeOf('string');
		expect(ex.options).toEqual({});
	});

	it('accepts an example with arbitrary nested config', () => {
		const ex: IPluginConfigExample = {
			summary: 'Tune the swarm timeout.',
			options: {
				defaultSliceGate: 'lint',
				familyCascade: ['f', 'p'],
				notify: { onRelease: true },
			},
		};
		expect(ex.options.familyCascade).toEqual(['f', 'p']);
	});
});
