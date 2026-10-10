import { describe, expect, it } from 'vitest';

import { useTranslations } from '#I18N/ui';
import {
	buildPluginProfile,
	resolveGeneratedPluginProfile,
} from '#DATA/plugin-profile';

/**
 * WEB-003 — the plugin page consumes the generated manifest web catalog
 * directly for profile metadata. Astro component SSR is not unit-tested in
 * this project today; this spec locks the exact render model the page reads.
 */
describe('plugin profile data', () => {
	const translated = useTranslations('en').pluginpage;
	const migratedPlugins = ['search', 'context-for-change'] as const;

	it('exposes permissions, tokenBudget, maturity and presets in the generated catalog', () => {
		for (const slug of migratedPlugins) {
			const entry = resolveGeneratedPluginProfile(slug);
			expect(entry, `${slug} catalog entry`).toBeDefined();
			expect(
				entry?.permissions.length,
				`${slug} permissions`,
			).toBeGreaterThan(0);
			expect(entry?.presets.length, `${slug} presets`).toBeGreaterThan(0);
			expect(entry?.maturity.length, `${slug} maturity`).toBeGreaterThan(
				0,
			);
			expect(typeof entry?.tokenBudget.warning, `${slug} warning`).toBe(
				'number',
			);
			expect(typeof entry?.tokenBudget.hard, `${slug} hard`).toBe(
				'number',
			);
		}
	});

	it('builds the localized profile model consumed by PluginPage', () => {
		const search = buildPluginProfile('search', translated);
		expect(search?.maturity).toBe(translated.maturityStable);
		expect(search?.permissions).toContain(
			translated.permissionFilesystemRead,
		);
		expect(search?.presets).toContain('minimal');
		expect(search?.tokenBudget.warning).toBe(2700);
		expect(search?.tokenBudget.hard).toBe(3000);

		const contextForChange = buildPluginProfile(
			'context-for-change',
			translated,
		);
		expect(contextForChange?.maturity).toBe(
			translated.maturityExperimental,
		);
		expect(contextForChange?.presets).toEqual(['dogfood']);
		expect(contextForChange?.permissions).toEqual([
			translated.permissionFilesystemRead,
		]);
	});
});
