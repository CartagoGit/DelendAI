import { describe, expect, it } from 'vitest';

import {
	detectCatalogPresetDrift,
	diffMembership,
	findHostOnlyChainViolations,
	findManifestPresetDrift,
	findPackOverlayDrift,
	formatReport,
	type IPresetDriftFinding,
} from './preset-drift.script';

describe('preset-drift.script', async () => {
	it('reports a clean count-only summary', async () => {
		expect(formatReport([], true)).toBe('preset-drift: 0 finding(s).\n');
	});

	it('diffMembership surfaces missing and unexpected members', async () => {
		expect(diffMembership(['git', 'search'], ['git', 'docs'])).toEqual({
			missing: ['search'],
			unexpected: ['docs'],
		});
	});

	it('rejects hostOnly members inside the non-host chain presets', async () => {
		const findings = findHostOnlyChainViolations([
			{
				id: 'minimal',
				title: 'minimal',
				summary: 'x',
				role: 'orientation',
				members: [{ plugin: 'web-fetch', hostOnly: true }],
				budget: {
					toolCount: {
						value: 1,
						source: 'measured-runtime',
						measuredAt: '2026-08-24',
					},
					schemaBytes: {
						value: 10,
						source: 'measured-runtime',
						measuredAt: '2026-08-24',
					},
					coldStartTokens: {
						value: 3,
						source: 'estimated-from-schema-bytes',
						measuredAt: '2026-08-24',
						bytesPerEstimatedToken: 4,
					},
					permissions: {
						source: 'measured-tool-effects',
						values: ['spawn'],
					},
					capabilities: {
						source: 'role-profile',
						values: ['orientation'],
					},
				},
			},
		] as never);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.kind).toBe('host-only-chain-violation');
	});

	it('rejects pack overlays for plugins absent from the preset', async () => {
		const findings = findPackOverlayDrift(['backend-api'], {
			'backend-api': {
				api: {},
			},
		});
		expect(findings).toHaveLength(1);
		expect(findings[0]?.kind).toBe('stack-pack-overlay-drift');
		expect(findings[0]?.detail).toContain('api');
	});

	it('rejects manifest rows whose declared preset differs from the catalog', async () => {
		const findings = findManifestPresetDrift([
			{
				pluginId: 'search',
				presetId: 'minimal',
				declared: false,
				catalogMember: true,
				matches: false,
			},
		]);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.kind).toBe('manifest-preset-drift');
	});

	it('keeps the real repo clean for catalog-only checks', async () => {
		const findings = await detectCatalogPresetDrift(process.cwd());
		expect(findings).toEqual([]);
		// No per-test timeout: `tools/vitest.config.ts` sets a ceiling wide
		// enough for a full-repo scan on a loaded machine.
	});

	it('prints one row per finding in strict mode', async () => {
		const out = formatReport([
			{
				absPath: '/x',
				relPath: 'x.md',
				line: 7,
				kind: 'dogfood-config-drift',
				detail: 'dogfood drift',
			},
		] satisfies readonly IPresetDriftFinding[]);
		expect(out).toContain('preset-drift: 1 finding');
		expect(out).toContain('x.md:7');
		expect(out).toContain('dogfood drift');
	});
});
