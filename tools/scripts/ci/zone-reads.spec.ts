/**
 * zone-reads.spec.ts — a change outside every workspace reaches only the
 * zones observed to read it.
 */
import { describe, expect, it } from 'vitest';

import type { IRootChange, IZoneReadMap } from './test-zones.interface';
import {
	parseZoneReadMap,
	runsEverything,
	testRunnerChanged,
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

	it('runs everything for a file at the repository root or under .github', () => {
		expect(
			zonesReadingRootFiles([edited('package.json')], MAP),
		).toBeUndefined();
		expect(
			zonesReadingRootFiles([edited('.github/workflows/ci.yml')], MAP),
		).toBeUndefined();
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

	it('leaves the test runner as it was when only a lint step changed', () => {
		expect(
			testRunnerChanged(
				workflow('bun run lint:a', 'bun run test'),
				workflow('bun run lint:b', 'bun run test'),
			),
		).toBe(false);
	});

	it('changes the test runner when the zone job changed', () => {
		expect(
			testRunnerChanged(
				workflow('bun run lint:a', 'bun run test'),
				workflow('bun run lint:a', 'bun run test --shard'),
			),
		).toBe(true);
	});

	it('counts a side that is missing as a change', () => {
		expect(testRunnerChanged(undefined, workflow('a', 'b'))).toBe(true);
	});

	it('reaches only the zones that read it when it leaves the runner alone', () => {
		// #912: one trigger of ci.yml and a lint script ran all eleven shards.
		const change = {
			...edited('.github/workflows/release.yml'),
			runnerChanged: false,
		};
		expect(runsEverything(change)).toBe(false);
		expect(zonesReadingRootFiles([change], MAP)).toEqual(new Set(['core']));
	});

	it('still runs everything when it is unknown whether the runner changed', () => {
		expect(runsEverything(edited('.github/workflows/ci.yml'))).toBe(true);
	});

	it('still runs everything for a composite action, which every job uses', () => {
		expect(
			runsEverything({
				...edited('.github/actions/setup-bun-repo/action.yml'),
				runnerChanged: false,
			}),
		).toBe(true);
	});
});
