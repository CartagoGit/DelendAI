/**
 * plugin-wiring.spec.ts — f00547 S2.
 *
 * Pins that the plugin entry, as it stands through S2–S4, registers
 * no tools and carries no describe-time side effects. S5 changes this
 * expectation deliberately when it adds the two tools.
 */
import { describe, expect, it } from 'vitest';

import type {
	IMcpPluginContext,
	IMcpPluginRegistrations,
} from '@delendai/core/public';
import { fakePartial } from '@delendai/test-kit';

import plugin from '../../src/index';

describe('the framework-knowledge plugin entry', () => {
	it('names itself and describes what it will answer', () => {
		expect(plugin.name).toBe('framework-knowledge');
		expect(plugin.describe).toContain('installed framework version');
	});

	it('registers no tools yet', async () => {
		const ctx = fakePartial<IMcpPluginContext>({});
		const registrations = (await plugin.register(
			ctx,
		)) as IMcpPluginRegistrations;
		expect(registrations.tools ?? []).toEqual([]);
	});
});
