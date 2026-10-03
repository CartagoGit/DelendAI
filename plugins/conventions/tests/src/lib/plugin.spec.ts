/**
 * Smoke test: the plugin registers the expected `conventions_*` tools
 * over a fake context (f00037 S3).
 */
import { describe, expect, it } from 'vitest';

import plugin from '../../../src/index';

describe('conventions plugin', async () => {
	it('defines the plugin metadata', async () => {
		expect(plugin.name).toBe('conventions');
		expect(typeof plugin.register).toBe('function');
	});

	it('registers conventions_classify and conventions_check', async () => {
		const registered = await plugin.register({
			namespacePrefix: 'conventions',
			workspace: { root: '/tmp/ws' },
			options: {},
		} as never);
		const ids = (registered.tools ?? []).map((t) => t.id);
		expect(ids).toContain('conventions_classify');
		expect(ids).toContain('conventions_check');
	});
});
