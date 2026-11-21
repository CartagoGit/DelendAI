import { describe, expect, it } from 'vitest';

import { firstPartyPluginCandidates } from './first-party-candidates';

describe('firstPartyPluginCandidates (x00169)', () => {
	it('maps every entry from the shared plugin registry', () => {
		const candidates = firstPartyPluginCandidates();
		// x00169: `plugins_recommend` used to score against `[]` in
		// production — nothing wired the bundled registry in, no matter
		// what the docstring said.
		expect(candidates.length).toBeGreaterThan(30);
		const security = candidates.find((c) => c.id === 'security');
		expect(security).toBeDefined();
		expect(security?.tags).toContain('security');
		expect(security?.summary.length).toBeGreaterThan(0);
		expect(security?.permissions).toContain('filesystem-read');
	});

	it('produces unique ids', () => {
		const ids = firstPartyPluginCandidates().map((c) => c.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('includes auto-plugin-selector so the recommender knows itself', () => {
		const candidate = firstPartyPluginCandidates().find(
			(entry) => entry.id === 'auto-plugin-selector',
		);
		expect(candidate).toBeDefined();
		expect(candidate?.origin).toBe('first-party');
		expect(candidate?.tags).toContain('plugins');
	});
});
