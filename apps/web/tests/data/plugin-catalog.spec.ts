import { describe, expect, it } from 'vitest';

import {
	PLUGIN_CATALOG,
	PLUGIN_SLUGS,
	capabilityCountFor,
	capabilityToolsFor,
	resolvePluginPurpose,
} from '#DATA/plugin-catalog';
import { GENERATED_WEB_PLUGIN_CATALOG } from '#DATA/plugins/catalog.generated';
import { GENERATED_PLUGIN_MANIFEST_WEB_CATALOG } from '#DATA/../generated/plugin-manifest-catalog.generated';

/**
 * f00053 S1 — the canonical plugin catalog is the single source of
 * truth for per-plugin copy. These specs lock in: every shipped plugin
 * has a real, plugin-specific purpose (never the generic fallback), and
 * the resolution order is the documented one.
 *
 * Spec lives under `tests/` (not next to the module in `src/data/`)
 * because the `apps-web` vitest project only discovers `tests/**` and
 * `scripts/__tests__/**`.
 */

const EXPECTED_SLUGS = GENERATED_WEB_PLUGIN_CATALOG.map((entry) => entry.slug);

const VALID_CATEGORIES = new Set([
	'workflow',
	'quality',
	'code-intelligence',
	'knowledge',
	'observability',
	'integration',
]);

describe('PLUGIN_CATALOG', () => {
	it('covers exactly the generated public plugin catalog', () => {
		expect([...PLUGIN_SLUGS].sort()).toEqual([...EXPECTED_SLUGS].sort());
	});

	it('every plugin has a non-empty, plugin-specific purpose (not the generic fallback)', () => {
		for (const slug of EXPECTED_SLUGS) {
			const entry = PLUGIN_CATALOG[slug];
			expect(entry, `missing catalog entry for ${slug}`).toBeDefined();
			expect(entry.purpose.length).toBeGreaterThan(20);
			expect(entry.purpose).not.toBe(`Plugin: ${slug}.`);
			expect(entry.displayName.length).toBeGreaterThan(0);
			expect(VALID_CATEGORIES.has(entry.category)).toBe(true);
		}
	});

	it('each purpose is distinct (no copy-paste duplication across plugins)', () => {
		const purposes = EXPECTED_SLUGS.map((s) => PLUGIN_CATALOG[s].purpose);
		expect(new Set(purposes).size).toBe(purposes.length);
	});
});

describe('resolvePluginPurpose', () => {
	it('returns the canonical purpose for a known plugin (canonical wins)', () => {
		expect(
			resolvePluginPurpose('proposals', {
				i18nOverride: 'an override that must not win',
			}),
		).toBe(PLUGIN_CATALOG.proposals.purpose);
	});

	it('falls back to the i18n override for an unknown slug', () => {
		expect(
			resolvePluginPurpose('not-a-plugin', {
				i18nOverride: 'localized copy',
			}),
		).toBe('localized copy');
	});

	it('falls back to the first tool description when no override exists', () => {
		expect(
			resolvePluginPurpose('not-a-plugin', {
				firstToolDescription: 'does a thing',
			}),
		).toBe('does a thing');
	});

	it('returns the generic last-resort string when nothing else resolves', () => {
		expect(resolvePluginPurpose('not-a-plugin')).toBe(
			'Plugin: not-a-plugin.',
		);
	});
});

describe('capabilityCountFor / capabilityToolsFor', () => {
	it('derives a positive tool count for a plugin that contributes tools', () => {
		// `proposals` is the largest tool surface in the active preset.
		expect(capabilityCountFor('proposals')).toBeGreaterThan(0);
		expect(capabilityToolsFor('proposals').length).toBe(
			capabilityCountFor('proposals'),
		);
	});

	it('returns 0 for a plugin absent from the current capabilities snapshot', () => {
		// A plugin not in the active preset contributes no tools here.
		expect(capabilityCountFor('definitely-not-loaded')).toBe(0);
	});
});

describe('GENERATED_PLUGIN_MANIFEST_WEB_CATALOG', () => {
	it('includes manifest-backed profile fields for every web entry', () => {
		for (const entry of GENERATED_PLUGIN_MANIFEST_WEB_CATALOG) {
			expect(
				entry.permissions.length,
				`${entry.id}.permissions`,
			).toBeGreaterThan(0);
			expect(Array.isArray(entry.presets), `${entry.id}.presets`).toBe(
				true,
			);
			expect(
				entry.maturity.length,
				`${entry.id}.maturity`,
			).toBeGreaterThan(0);
			expect(
				entry.tokenBudget.warning,
				`${entry.id}.warning`,
			).toBeGreaterThan(0);
			expect(entry.tokenBudget.hard, `${entry.id}.hard`).toBeGreaterThan(
				0,
			);
			expect(
				entry.tokenBudget.releaseRelativePercent,
				`${entry.id}.releaseRelativePercent`,
			).toBeGreaterThan(0);
		}
	});
});
