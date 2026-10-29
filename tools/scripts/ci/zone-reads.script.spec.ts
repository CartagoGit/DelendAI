/**
 * zone-reads.script.spec.ts — the committed read map keeps only what
 * exists, sorted, so regenerating it is deterministic.
 */
import { describe, expect, it } from 'vitest';

import { buildZoneReadMap, recordedPathsOf } from './zone-reads.script';

const KINDS: Record<string, 'file' | 'dir'> = {
	'docs/a.md': 'file',
	'docs/b.md': 'file',
	docs: 'dir',
};
const kindOf = (path: string) => KINDS[path];

describe('buildZoneReadMap', () => {
	it('keeps each file read, apart from the directories listed', () => {
		const map = buildZoneReadMap(
			{ core: ['docs/b.md', 'docs', 'docs/a.md', 'guide/c.md'] },
			(path) => (path === 'guide/c.md' ? 'file' : kindOf(path)),
		);
		expect(map.zones.core).toEqual({
			read: ['docs/a.md', 'docs/b.md', 'guide/c.md'],
			listed: ['docs'],
		});
	});

	it('drops paths the resolver only probed, which never existed', () => {
		const map = buildZoneReadMap({ core: ['zod.ts', 'docs/a.md'] }, kindOf);
		expect(map.zones.core?.read).toEqual(['docs/a.md']);
	});

	it('orders the zones so the file does not churn between runs', () => {
		const map = buildZoneReadMap({ tools: [], apps: [], core: [] }, kindOf);
		expect(Object.keys(map.zones)).toEqual(['apps', 'core', 'tools']);
	});
});

describe('recordedPathsOf', () => {
	it('rebuilds the committed map from itself, dropping what no longer exists', () => {
		const committed = {
			zones: {
				core: {
					read: ['docs/a.md', 'docs/gone.md'],
					listed: ['docs', 'docs/removed'],
				},
			},
		};
		const map = buildZoneReadMap(recordedPathsOf(committed), kindOf);
		expect(map).toEqual({
			zones: { core: { read: ['docs/a.md'], listed: ['docs'] } },
		});
		expect(buildZoneReadMap(recordedPathsOf(map), kindOf)).toEqual(map);
	});
});

describe('reads kept by spec', () => {
	const kindOf = (path: string) =>
		path.endsWith('/') || !path.includes('.')
			? ('dir' as const)
			: ('file' as const);

	it('keeps the zone totals and, beside them, what each spec read', () => {
		const map = buildZoneReadMap(
			{
				plugins: [
					'plugins/x/a.spec.ts\tdocs/a.md',
					'plugins/y/b.spec.ts\tdocs/delendai/proposals',
					'docs/legacy.md',
				],
			},
			kindOf,
		);
		expect(map.zones.plugins?.read).toEqual([
			'docs/a.md',
			'docs/legacy.md',
		]);
		expect(map.zones.plugins?.specs).toEqual({
			'plugins/x/a.spec.ts': { read: ['docs/a.md'], listed: [] },
			'plugins/y/b.spec.ts': {
				read: [],
				listed: ['docs/delendai/proposals'],
			},
		});
	});

	it('survives a prune: the map rebuilt from itself is the same map', () => {
		const map = buildZoneReadMap(
			{ plugins: ['plugins/x/a.spec.ts\tdocs/a.md', 'docs/legacy.md'] },
			kindOf,
		);
		expect(buildZoneReadMap(recordedPathsOf(map), kindOf)).toEqual(map);
	});
});
