import { describe, expect, it } from 'vitest';

import { PageRegistry } from '../dev/pages/registry';

describe('VS Code dev page registry', () => {
	it('lazy-loads the Configuration Center preview page', async () => {
		const registry = new PageRegistry({ navigate: () => undefined });
		expect(registry.ids()).toContain('configuration');
		expect(registry.label('configuration')).toBe('configuration');
		expect((await registry.resolve('configuration')).id).toBe(
			'configuration',
		);
	});
});
