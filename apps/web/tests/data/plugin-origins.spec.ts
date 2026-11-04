import { describe, expect, it } from 'vitest';

import {
	pluginOriginCopyFor,
	pluginOriginForCatalogSlug,
} from '#DATA/plugin-origins';
import { languages } from '#I18N/index';

describe('plugin origin catalog', () => {
	it('classifies every canonical catalog plugin as bundled without a second slug list', () => {
		expect(pluginOriginForCatalogSlug('proposals')).toBe('bundled');
		expect(pluginOriginForCatalogSlug('not-catalogued')).toBeUndefined();
	});

	it('has complete non-empty origin copy for every language', () => {
		for (const { code } of languages) {
			const value = pluginOriginCopyFor(code);
			expect(value.intro.length).toBeGreaterThan(0);
			for (const origin of [
				'bundled',
				'user-local',
				'external',
			] as const) {
				expect(value[origin].label.length).toBeGreaterThan(0);
				expect(value[origin].description.length).toBeGreaterThan(0);
			}
		}
	});
});
