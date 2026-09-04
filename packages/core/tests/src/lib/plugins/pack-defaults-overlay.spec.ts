/**
 * pack-defaults-overlay.spec.ts — r00011 S1 acceptance: the
 * per-pack tuned option overlay applies between PLUGIN_DEFAULTS
 * and the user's explicit config (user always wins).
 */
import { describe, expect, it } from 'vitest';

import {
	isPackId,
	mergePackDefaults,
	PACK_DEFAULTS_OVERLAY,
	PACK_IDS,
	resolvePackOptions,
} from '@delendai/core/lib/plugins/pack-defaults-overlay';

describe('PACK_IDS', () => {
	it('lists the three r00011 stack packs', () => {
		expect([...PACK_IDS]).toEqual(['web-app', 'backend-api', 'cli-tool']);
	});
});

describe('resolvePackOptions', () => {
	it('returns the overlay entry for a known (pack, plugin) pair', () => {
		expect(resolvePackOptions('web-app', 'i18n')).toEqual({
			defaultLocale: 'en',
			strict: false,
		});
	});

	it('returns undefined for a known pack but unknown plugin', () => {
		expect(resolvePackOptions('web-app', 'no-such-plugin')).toBeUndefined();
	});

	it('returns undefined for an unknown pack id', () => {
		expect(resolvePackOptions('not-a-pack', 'i18n')).toBeUndefined();
	});

	it('is pure (same input -> same output reference-equal content)', () => {
		const a = resolvePackOptions('backend-api', 'search');
		const b = resolvePackOptions('backend-api', 'search');
		expect(a).toEqual(b);
	});
});

describe('mergePackDefaults', () => {
	it('returns the user config unchanged when packId is undefined', () => {
		const user = { quality: { topActions: 12 } };
		expect(mergePackDefaults(user, undefined)).toEqual(user);
	});

	it('returns the user config unchanged for an unknown pack', () => {
		const user = { quality: { topActions: 12 } };
		expect(mergePackDefaults(user, 'mystery-pack')).toEqual(user);
	});

	it('overlays pack defaults under the user config (user wins)', () => {
		// web-app overlay wants quality.topActions=8; the user wants 12.
		const user = { quality: { topActions: 12 } };
		const merged = mergePackDefaults(user, 'web-app');
		expect(merged.quality).toEqual({ topActions: 12 });
	});

	it('fills unset options from the overlay', () => {
		const user = { quality: { topActions: 12 } };
		const merged = mergePackDefaults(user, 'web-app');
		// i18n not in user config — overlay entry survives.
		expect(merged.i18n).toEqual({ defaultLocale: 'en', strict: false });
		// search not in user config — overlay entry survives.
		expect(merged.search).toEqual({
			hybridWeights: { bm25: 0.7, vector: 0.3 },
		});
	});

	it('merges per-key when both user and overlay define the same option key', () => {
		// web-app overlay sets i18n.strict=false; user sets
		// i18n.defaultLocale='es' but does not set strict.
		const user = { i18n: { defaultLocale: 'es' } };
		const merged = mergePackDefaults(user, 'web-app');
		expect(merged.i18n).toEqual({ defaultLocale: 'es', strict: false });
	});

	it('returns overlay-only entries when the user config is empty', () => {
		const merged = mergePackDefaults({}, 'cli-tool');
		expect(merged.search).toEqual({
			hybridWeights: { bm25: 0.8, vector: 0.2 },
		});
		// f00177 / MAN-001: `changelog` overlay removed with the plugin
		// itself — `changelog` is `private: true` and no longer a member
		// of the `cli-tool` preset.
		expect(merged.changelog).toBeUndefined();
	});

	it('does not mutate the overlay table (clones every option)', () => {
		const user = { quality: { topActions: 99 } };
		mergePackDefaults(user, 'web-app');
		// overlay unchanged after a merge
		expect(PACK_DEFAULTS_OVERLAY['web-app'].quality).toEqual({
			topActions: 8,
		});
	});
});

describe('isPackId', () => {
	it('accepts every canonical pack id', () => {
		for (const id of PACK_IDS) {
			expect(isPackId(id)).toBe(true);
		}
	});

	it('rejects chain preset ids', () => {
		for (const id of [
			'minimal',
			'lean',
			'standard',
			'swarm',
			'full',
			'vertex',
		]) {
			expect(isPackId(id)).toBe(false);
		}
	});

	it('rejects undefined', () => {
		expect(isPackId(undefined)).toBe(false);
	});

	it('rejects unknown ids', () => {
		expect(isPackId('not-a-pack')).toBe(false);
	});
});

describe('overlay coherence with the catalog', () => {
	it('every overlay plugin id is a member of its pack in PRESET_CATALOG', async () => {
		const { PRESET_CATALOG } = await import(
			'@delendai/core/lib/plugins/preset-catalog'
		);
		for (const packId of PACK_IDS) {
			const def = PRESET_CATALOG.find((d) => d.id === packId);
			expect(
				def,
				`pack ${packId} missing from PRESET_CATALOG`,
			).toBeDefined();
			const members = new Set(def?.members.map((m) => m.plugin) ?? []);
			for (const pluginId of Object.keys(PACK_DEFAULTS_OVERLAY[packId])) {
				expect(
					members.has(pluginId),
					`pack ${packId} declares overlay for "${pluginId}" but the plugin is not in the pack's members list`,
				).toBe(true);
			}
		}
	});
});
