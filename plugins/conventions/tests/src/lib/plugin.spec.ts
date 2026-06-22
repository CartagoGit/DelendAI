import { describe, expect, it } from 'vitest';
import plugin from '../../../src/index.js';

describe('conventions plugin', () => {
	it('defines the plugin correctly', () => {
		expect(plugin.name).toBe('conventions');
		expect(typeof plugin.register).toBe('function');
	});
});
