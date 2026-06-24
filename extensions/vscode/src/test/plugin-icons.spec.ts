import { describe, expect, it } from 'vitest';

import {
	DEFAULT_PLUGIN_ICON_ID,
	PLUGIN_ICON_BY_SLUG,
	PLUGIN_SLUGS,
	SERVER_ICON_ID,
	iconIdForPlugin,
} from '../host/plugin-icons';

/**
 * f00053 S3 — every shipped plugin must have a distinct, real icon in
 * the extension tool tree (no missing, no duplicated, no text fallback).
 */
describe('plugin-icons', () => {
	it('maps every one of the 16 plugins to an icon', () => {
		expect(PLUGIN_SLUGS).toHaveLength(16);
		for (const slug of PLUGIN_SLUGS) {
			const icon = PLUGIN_ICON_BY_SLUG[slug];
			expect(
				typeof icon === 'string' && icon.length > 0,
				`missing icon for ${slug}`,
			).toBe(true);
		}
	});

	it('gives every plugin a DISTINCT icon (no two share a glyph)', () => {
		const icons = PLUGIN_SLUGS.map((slug) => PLUGIN_ICON_BY_SLUG[slug]);
		expect(new Set(icons).size).toBe(icons.length);
	});

	it('has no stray icon entries beyond the shipped plugins', () => {
		expect([...Object.keys(PLUGIN_ICON_BY_SLUG)].sort()).toEqual(
			[...PLUGIN_SLUGS].sort(),
		);
	});

	it('resolves a known plugin to its mapped icon', () => {
		expect(iconIdForPlugin('proposals')).toBe(
			PLUGIN_ICON_BY_SLUG.proposals,
		);
	});

	it('resolves an unknown namespace to a real default icon (never text)', () => {
		expect(iconIdForPlugin('mcp-vertex')).toBe(DEFAULT_PLUGIN_ICON_ID);
		expect(DEFAULT_PLUGIN_ICON_ID.length).toBeGreaterThan(0);
	});

	it('the server node has its own distinct icon', () => {
		expect(SERVER_ICON_ID.length).toBeGreaterThan(0);
		expect(Object.values(PLUGIN_ICON_BY_SLUG)).not.toContain(
			SERVER_ICON_ID,
		);
	});
});
