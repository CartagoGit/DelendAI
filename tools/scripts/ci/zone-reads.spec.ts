/**
 * zone-reads.spec.ts — a change outside every workspace reaches only the
 * zones observed to read it.
 */
import { describe, expect, it } from 'vitest';

import type { IRootChange, IZoneReadMap } from './test-zones.interface';
import {
	parseZoneReadMap,
	readersOf,
	onlyScriptsChanged,
	runsEverything,
	changedWorkflowJobs,
	zonesReadingRootFiles,
} from './zone-reads';

const MAP: IZoneReadMap = {
	zones: {
		proposals: {
			read: ['docs/delendai/proposals/ready/fixes/x00001-a.md'],
			listed: ['docs/delendai/proposals/ready/feats', 'docs/delendai'],
		},
		core: {
			read: [
				'docs/delendai/AGENT-BOOTSTRAP.md',
				'.github/workflows/release.yml',
			],
			listed: ['docs', 'docs/delendai/proposals', 'tools'],
		},
		apps: { read: [], listed: [] },
	},
};

const edited = (path: string): IRootChange => ({ path, listing: false });
const added = (path: string): IRootChange => ({ path, listing: true });

describe('zonesReadingRootFiles', () => {
	it('runs everything without a map', () => {
		expect(
			zonesReadingRootFiles([edited('docs/x.md')], undefined),
		).toBeUndefined();
	});

	it('runs everything for a file at the repository root, and not for a workflow', () => {
		expect(
			zonesReadingRootFiles([edited('package.json')], MAP),
		).toBeUndefined();
		expect(
			zonesReadingRootFiles([edited('.github/workflows/ci.yml')], MAP),
		).toEqual(new Set());
	});

	it('sends an edited file to the zones that read it', () => {
		expect(
			zonesReadingRootFiles(
				[edited('docs/delendai/proposals/ready/fixes/x00001-a.md')],
				MAP,
			),
		).toEqual(new Set(['proposals']));
	});

	it('does not send an edited file to a zone that only listed a folder above it', () => {
		// Listing depends on which files a folder holds, not on what they
		// say. `core` lists `docs` and `docs/delendai/proposals`: an edit
		// deep inside reached it anyway, and every zone ran (#648).
		expect(
			zonesReadingRootFiles(
				[edited('docs/delendai/proposals/review/q00014-x.md')],
				MAP,
			),
		).toEqual(new Set());
	});

	it('sends a file added to, or removed from, a listed folder to the zones that listed it', () => {
		expect(
			zonesReadingRootFiles(
				[added('docs/delendai/proposals/ready/feats/f00999-new.md')],
				MAP,
			),
		).toEqual(new Set(['proposals']));
	});

	it('sends a file under a zone’s own paths to that zone', () => {
		expect(
			zonesReadingRootFiles([edited('tests/e2e/run.spec.ts')], MAP, {
				tools: ['tools', 'tests/e2e'],
				core: ['packages/core'],
			}),
		).toEqual(new Set(['tools']));
	});

	it('unions the zones of several files', () => {
		expect(
			zonesReadingRootFiles(
				[
					edited('docs/delendai/AGENT-BOOTSTRAP.md'),
					edited('docs/delendai/proposals/ready/fixes/x00001-a.md'),
				],
				MAP,
			),
		).toEqual(new Set(['core', 'proposals']));
	});
});

describe('parseZoneReadMap', () => {
	it('reads a well-formed map', () => {
		expect(parseZoneReadMap(JSON.stringify(MAP))).toEqual(MAP);
	});

	it('treats anything else as no map at all', () => {
		expect(parseZoneReadMap(undefined)).toBeUndefined();
		expect(parseZoneReadMap('{ not json')).toBeUndefined();
		expect(parseZoneReadMap('null')).toBeUndefined();
		expect(parseZoneReadMap('{"zones":{"a":{"read":[]}}}')).toBeUndefined();
		expect(
			parseZoneReadMap('{"zones":{"a":{"readIn":[],"listed":[]}}}'),
		).toBeUndefined();
	});
});

describe('a workflow edit', () => {
	const workflow = (lint: string, tests: string): string =>
		[
			'name: CI',
			'on:',
			'    pull_request:',
			'        branches: [develop]',
			'jobs:',
			'    lint-security:',
			'        runs-on: ubuntu-latest',
			'        steps:',
			`            - run: ${lint}`,
			'    tests-zone:',
			'        runs-on: ubuntu-latest',
			'        steps:',
			`            - run: ${tests}`,
			'',
		].join('\n');

	it('names the jobs whose block changed, and no other', () => {
		expect(
			changedWorkflowJobs(
				workflow('bun run lint:brand', 'bun run test'),
				workflow('bun run lint:privacy', 'bun run test'),
			),
		).toEqual(new Set(['lint-security']));
		expect(
			changedWorkflowJobs(
				workflow('bun run lint:brand', 'bun run test'),
				workflow('bun run lint:brand', 'bun run test --shard'),
			),
		).toEqual(new Set(['tests-zone']));
	});

	it('names every job when what they inherit changed', () => {
		expect(
			changedWorkflowJobs(
				workflow('a', 'b'),
				`env:\n    X: '1'\n${workflow('a', 'b')}`,
			),
		).toEqual(new Set(['lint-security', 'tests-zone']));
	});

	it('counts a side that is missing as all of it', () => {
		expect(
			changedWorkflowJobs(undefined, workflow('a', 'b')),
		).toBeUndefined();
	});

	it('reaches only the zones that read it, never every spec, even the test workflow', () => {
		// #912: one trigger of ci.yml and a lint script ran all eleven shards.
		expect(runsEverything(edited('.github/workflows/ci.yml'))).toBe(false);
		const change = edited('.github/workflows/release.yml');
		expect(runsEverything(change)).toBe(false);
		expect(zonesReadingRootFiles([change], MAP)).toEqual(new Set(['core']));
	});

	it('lets prose reach only the zones that read it, and not configuration', () => {
		for (const path of [
			'README.md',
			'CHANGELOG.md',
			'LICENSE',
			'.mailmap',
			'.github/agents/delendai.agent.md',
			'.github/SECURITY.md',
		])
			expect(runsEverything(edited(path))).toBe(false);
		for (const path of [
			'delendai.config.json',
			'package.json',
			'bun.lock',
			'tsconfig.json',
			'vitest.config.ts',
			'.gitattributes',
		])
			expect(runsEverything(edited(path))).toBe(true);
	});

	it('reaches the readers of a composite action, which every job that runs proves', () => {
		expect(
			runsEverything(edited('.github/actions/setup-bun-repo/action.yml')),
		).toBe(false);
	});
});

describe('a change to the root manifest', () => {
	const manifest = (scripts: object, devDependencies: object = {}): string =>
		JSON.stringify({ name: 'root', scripts, devDependencies });

	it('reaches only its readers when only other scripts changed', () => {
		const scriptsOnly = onlyScriptsChanged(
			manifest({ 'lint:a': 'one', test: 'vitest' }),
			manifest({ 'lint:a': 'two', 'lint:b': 'new', test: 'vitest' }),
		);
		expect(scriptsOnly).toBe(true);
		expect(runsEverything({ ...edited('package.json'), scriptsOnly })).toBe(
			false,
		);
	});

	it('runs everything for a test script, an install hook or a dependency', () => {
		for (const [before, after] of [
			[manifest({ 'test:shard': 'a' }), manifest({ 'test:shard': 'b' })],
			[manifest({ prepare: 'a' }), manifest({ prepare: 'b' })],
			[manifest({ postinstall: 'a' }), manifest({})],
			[
				manifest({}, { vitest: '5.0.0' }),
				manifest({}, { vitest: '5.0.3' }),
			],
		] as const) {
			const scriptsOnly = onlyScriptsChanged(before, after);
			expect(scriptsOnly).toBe(false);
			expect(
				runsEverything({ ...edited('package.json'), scriptsOnly }),
			).toBe(true);
		}
	});

	it('runs everything when a side is missing, unreadable, or never compared', () => {
		expect(onlyScriptsChanged(undefined, manifest({}))).toBe(false);
		expect(onlyScriptsChanged('{nope', manifest({}))).toBe(false);
		expect(runsEverything(edited('package.json'))).toBe(true);
	});

	it('does not excuse another root file that claims the same', () => {
		expect(
			runsEverything({ ...edited('tsconfig.json'), scriptsOnly: true }),
		).toBe(true);
	});
});

describe('readersOf', () => {
	const map: IZoneReadMap = {
		zones: {
			plugins: {
				read: ['docs/a.md'],
				listed: ['docs/delendai/proposals/review'],
				specs: {
					'plugins/x/a.spec.ts': { read: ['docs/a.md'], listed: [] },
					'plugins/y/b.spec.ts': {
						read: [],
						listed: ['docs/delendai/proposals/review'],
					},
					'plugins/z/c.spec.ts': {
						read: ['docs/other.md'],
						listed: [],
					},
				},
			},
			core: { read: ['docs/a.md'], listed: [] },
		},
	};

	it('names the specs that read a changed file or list the folder of a moved one', () => {
		const readers = readersOf(
			[
				{ path: 'docs/a.md', listing: false },
				{ path: 'docs/delendai/proposals/review/x1.md', listing: true },
			],
			map,
		);
		expect(readers.get('plugins')).toEqual([
			'plugins/x/a.spec.ts',
			'plugins/y/b.spec.ts',
		]);
	});

	it('says nothing of a zone whose map has no per-spec reads, and nothing for an edit in a listed folder', () => {
		const readers = readersOf(
			[{ path: 'docs/delendai/proposals/review/x1.md', listing: false }],
			map,
		);
		expect(readers.get('plugins')).toEqual([]);
		expect(readers.has('core')).toBe(false);
	});
});
