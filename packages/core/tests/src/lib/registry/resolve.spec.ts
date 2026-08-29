/**
 * resolve.spec.ts — f00141 S1 acceptance: the pure registry
 * resolver filters, sorts, and limits the bundled first-party
 * index without touching fs, network, or host config.
 */
import { describe, expect, it } from 'vitest';

import {
	FIRST_PARTY_PLUGIN_INDEX,
	resolvePlugins,
} from '@mcp-vertex/core/public';
import type {
	IPluginRegistryEntry,
	IPluginRegistrySource,
} from '@mcp-vertex/core/public';

const sample = (over: Partial<IPluginRegistryEntry>): IPluginRegistryEntry => ({
	id: over.id ?? 'sample',
	origin: over.origin ?? 'first-party',
	package: over.package ?? '@mcp-vertex/sample',
	summary: over.summary ?? 'sample summary',
	tags: over.tags ?? [],
	...(over.defaultPreset !== undefined
		? { defaultPreset: over.defaultPreset }
		: {}),
});

describe('FIRST_PARTY_PLUGIN_INDEX', () => {
	it('is a non-empty, well-formed index', () => {
		expect(FIRST_PARTY_PLUGIN_INDEX.origin).toBe('first-party');
		expect(FIRST_PARTY_PLUGIN_INDEX.entries.length).toBeGreaterThan(10);
		expect(
			FIRST_PARTY_PLUGIN_INDEX.entries.filter(
				(entry) => entry.id === 'search',
			),
		).toHaveLength(1);
		for (const entry of FIRST_PARTY_PLUGIN_INDEX.entries) {
			expect(entry.id).toMatch(/^[a-z][a-z0-9-]*$/u);
			expect(entry.package).toMatch(/^@mcp-vertex\//u);
			expect(entry.summary.length).toBeGreaterThan(10);
			expect(entry.origin).toBe('first-party');
		}
	});

	it('includes auto-plugin-selector as a bundled first-party plugin', () => {
		const entry = FIRST_PARTY_PLUGIN_INDEX.entries.find(
			(candidate) => candidate.id === 'auto-plugin-selector',
		);
		expect(entry).toBeDefined();
		expect(entry?.package).toBe('@mcp-vertex/auto-plugin-selector');
		expect(entry?.tags).toContain('plugins');
	});
});

describe('resolvePlugins', () => {
	it('returns the bundled first-party index when no sources are supplied', () => {
		const out = resolvePlugins();
		expect(out.entries.length).toBeGreaterThan(10);
		expect(out.total).toBe(FIRST_PARTY_PLUGIN_INDEX.entries.length);
		expect(out.entries).toHaveLength(Math.min(out.total, 50));
		expect(out.truncated).toBe(out.total > 50);
	});

	it('filters entries by AND-matched tags', () => {
		const out = resolvePlugins({ tags: ['f00136'] });
		for (const entry of out.entries) {
			expect(entry.tags).toContain('f00136');
		}
		expect(out.entries.length).toBeGreaterThan(0);
	});

	it('filters by origin', () => {
		const out = resolvePlugins({ origin: 'community' });
		// Bundled first-party index has no community entries.
		expect(out.entries).toEqual([]);
		expect(out.total).toBe(0);
	});

	it('combines an injected community source with the bundled index', () => {
		const community: IPluginRegistrySource = {
			origin: 'community',
			entries: [
				sample({
					id: 'demo-x',
					origin: 'community',
					summary: 'demo community plugin',
					tags: ['demo'],
				}),
			],
		};
		const out = resolvePlugins({
			sources: [community],
			origin: 'community',
		});
		expect(out.entries.map((e) => e.id)).toEqual(['demo-x']);
	});

	it('keeps the bundled first-party index as the fallback for community-only sources', () => {
		const community: IPluginRegistrySource = {
			origin: 'community',
			entries: [
				sample({
					id: 'community-search',
					origin: 'community',
					summary: 'community search helper',
					tags: ['search'],
				}),
			],
		};
		const out = resolvePlugins({ sources: [community], query: 'search' });
		expect(
			out.entries.some((entry) => entry.id === 'community-search'),
		).toBe(true);
		expect(out.entries.some((entry) => entry.id === 'search')).toBe(true);
	});

	it('matches the query case-insensitively across id, package, and summary', () => {
		const out = resolvePlugins({ query: 'AUDIT' });
		expect(out.entries.some((e) => e.id === 'audit')).toBe(true);
	});

	it('returns truncated: true when the limit clips the result', () => {
		const out = resolvePlugins({ limit: 3 });
		expect(out.entries).toHaveLength(3);
		expect(out.truncated).toBe(true);
		expect(out.total).toBeGreaterThan(3);
	});

	it('clamps the limit to >=1 and <=200', () => {
		const low = resolvePlugins({ limit: 0 });
		expect(low.entries.length).toBeGreaterThan(0);
		const high = resolvePlugins({ limit: 1000 });
		expect(high.entries.length).toBeLessThanOrEqual(200);
	});

	it('puts default-preset entries before non-default ones and sorts by id', () => {
		const source: IPluginRegistrySource = {
			origin: 'first-party',
			entries: [
				sample({ id: 'zeta', summary: 'no preset' }),
				sample({
					id: 'alpha',
					summary: 'standard',
					defaultPreset: 'standard',
				}),
				sample({
					id: 'beta',
					summary: 'standard',
					defaultPreset: 'standard',
				}),
			],
		};
		const out = resolvePlugins({ sources: [source] });
		expect(out.entries.map((e) => e.id)).toEqual(['alpha', 'beta', 'zeta']);
	});

	it('treats empty tag list as no filter', () => {
		const out = resolvePlugins({ tags: [] });
		expect(out.entries.length).toBeGreaterThan(10);
	});

	it('treats empty query as no filter', () => {
		const out = resolvePlugins({ query: '' });
		expect(out.entries.length).toBeGreaterThan(10);
	});
});
