import { describe, expect, it } from 'vitest';

import { buildActivationReport } from '@mcp-vertex/core/lib/plugins/activation-report';
import type {
	IActivationSources,
	ILoadedPluginFacts,
} from '@mcp-vertex/core/public';

const facts = (
	over: Partial<ILoadedPluginFacts> & { name: string },
): ILoadedPluginFacts => ({
	resolvedSpecifier: `@mcp-vertex/${over.name}`,
	hasExplicitPath: false,
	isExternalServer: false,
	toolCount: 1,
	...over,
});

const sources = (over: Partial<IActivationSources>): IActivationSources => ({
	fromFlag: new Set(),
	fromConfig: new Set(),
	fromPreset: new Set(),
	...over,
});

describe('buildActivationReport (f00107 S2)', () => {
	it('classifies origin, attributes source, and tallies per origin + total tools', () => {
		const report = buildActivationReport(
			[
				facts({ name: 'proposals', toolCount: 5 }), // bundled, from preset
				facts({
					name: 'my-plugin',
					resolvedSpecifier: '/abs/my-plugin.js',
					hasExplicitPath: true,
					toolCount: 2,
				}), // user-local, from config
				facts({
					name: 'ext.filesystem',
					resolvedSpecifier: 'ext.filesystem',
					isExternalServer: true,
					toolCount: 3,
				}), // external, from flag
			],
			sources({
				fromPreset: new Set(['proposals']),
				fromConfig: new Set(['my-plugin']),
				fromFlag: new Set(['ext.filesystem']),
			}),
		);

		expect(report.counts).toEqual({
			bundled: 1,
			'user-local': 1,
			external: 1,
		});
		expect(report.totalTools).toBe(10);
		expect(
			report.entries.map((e) => `${e.id}:${e.origin}:${e.source}`),
		).toEqual([
			'proposals:bundled:preset',
			'my-plugin:user-local:config',
			'ext.filesystem:external:flag',
		]);
	});

	it('source precedence is flag > config > preset when a name is in several', () => {
		const report = buildActivationReport([facts({ name: 'memory' })], {
			fromFlag: new Set(['memory']),
			fromConfig: new Set(['memory']),
			fromPreset: new Set(['memory']),
		});
		expect(report.entries[0]?.source).toBe('flag');
	});

	it('sorts by origin bucket (ours, yours, external) then id', () => {
		const names = ['zeta-ext', 'search', 'alpha-local', 'audit'];
		const report = buildActivationReport(
			[
				facts({
					name: 'zeta-ext',
					resolvedSpecifier: 'zeta-ext',
					isExternalServer: true,
				}),
				facts({ name: 'search' }), // bundled
				facts({
					name: 'alpha-local',
					resolvedSpecifier: './alpha.js',
					hasExplicitPath: true,
				}),
				facts({ name: 'audit' }), // bundled
			],
			sources({ fromPreset: new Set(names) }),
		);
		expect(report.entries.map((e) => e.id)).toEqual([
			'audit',
			'search',
			'alpha-local',
			'zeta-ext',
		]);
	});

	it('fails closed when a loaded plugin has no activation source', () => {
		expect(() =>
			buildActivationReport(
				[facts({ name: 'unattributed' })],
				sources({}),
			),
		).toThrowError(
			'Activation source invariant violated: loaded plugin "unattributed" is absent from flag, config, and preset inputs.',
		);
	});

	it('empty load → zeroed report', () => {
		const report = buildActivationReport([], sources({}));
		expect(report.entries).toEqual([]);
		expect(report.totalTools).toBe(0);
		expect(report.counts).toEqual({
			bundled: 0,
			'user-local': 0,
			external: 0,
		});
	});

	it('merges plugin-contributed child surfaces without plugin vocabulary in core', () => {
		const report = buildActivationReport(
			[facts({ name: 'external-mcps', toolCount: 7 })],
			sources({ fromConfig: new Set(['external-mcps']) }),
			[
				{
					id: 'ext.filesystem',
					origin: 'external',
					source: 'config',
					toolCount: 0,
				},
			],
		);

		expect(report.entries.map((entry) => entry.id)).toEqual([
			'external-mcps',
			'ext.filesystem',
		]);
		expect(report.counts).toEqual({
			bundled: 1,
			'user-local': 0,
			external: 1,
		});
		expect(report.totalTools).toBe(7);
	});

	it('keeps inactive contributions visible without counting their tools', () => {
		const report = buildActivationReport([], sources({}), [
			{
				id: 'git',
				origin: 'bundled',
				source: 'config',
				active: false,
				toolCount: 9,
			},
		]);
		expect(report.entries[0]?.active).toBe(false);
		expect(report.counts.bundled).toBe(0);
		expect(report.totalTools).toBe(0);
	});
});
