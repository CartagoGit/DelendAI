/**
 * tool-search-next-step.helper.spec.ts — the step a hidden tool's search
 * entry names.
 */
import { describe, expect, it } from 'vitest';

import { hiddenToolNextStep } from '../../../../src/lib/project/tool-search-next-step.helper';

describe('hiddenToolNextStep', () => {
	it('names the plugin to activate, by id or else by namespace', () => {
		expect(
			hiddenToolNextStep({ name: 'x_create', pluginId: 'proposals' }),
		).toContain('plugin "proposals"');
		expect(
			hiddenToolNextStep({ name: 'x_create', namespace: 'props' }),
		).toContain('plugin "props"');
	});

	it('points at the router when no plugin owns the tool', () => {
		expect(hiddenToolNextStep({ name: 'x_core' })).toContain(
			'compact_router',
		);
	});
});
