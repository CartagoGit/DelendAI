/**
 * The invariant a test split exists to not break.
 *
 * Every failure mode of grouping tests is silent. A spec that lands in
 * no job does not report anything — the checks go green with less
 * evidence behind them than yesterday, and nothing says so. The last
 * case here is therefore the important one: it walks every spec file
 * actually tracked in this repository and asserts each is reachable
 * from exactly one job's path filters. It fails the day someone adds a
 * top-level directory the rules do not cover.
 */

import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { planZones, zoneOf } from './test-zones.script';

const repoRoot = join(__dirname, '..', '..', '..');

const tracked = (): readonly string[] =>
	execFileSync('git', ['ls-files'], {
		cwd: repoRoot,
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024,
	})
		.split('\n')
		.filter((line) => line.length > 0);

const DIRS = [
	'packages/core',
	'packages/state',
	'plugins/proposals',
	'plugins/git',
	'apps/web',
	'extensions/vscode',
];

describe('zoneOf', () => {
	it('puts core in its own zone', () => {
		expect(zoneOf('packages/core/src/a.spec.ts')).toBe('core');
	});

	it('puts proposals in its own zone, ahead of the general plugins rule', () => {
		expect(zoneOf('plugins/proposals/src/a.spec.ts')).toBe('proposals');
	});

	it('puts any other plugin in the plugins zone', () => {
		expect(zoneOf('plugins/git/src/a.spec.ts')).toBe('plugins');
	});

	it('puts any other package in the packages zone', () => {
		expect(zoneOf('packages/state/src/a.spec.ts')).toBe('packages');
	});

	it('groups apps and the extension together', () => {
		expect(zoneOf('apps/web/src/a.spec.ts')).toBe('apps');
		expect(zoneOf('extensions/vscode/src/a.spec.ts')).toBe('apps');
	});

	// The catch-all. A spec under a directory nobody anticipated must
	// still run somewhere.
	it('gives a spec that matches no rule a home anyway', () => {
		expect(zoneOf('somewhere/nobody/expected.spec.ts')).toBe('tools');
	});
});

describe('planZones', () => {
	it('gives a zone one job when it fits', () => {
		const jobs = planZones({
			specs: ['packages/core/a.spec.ts'],
			workspaceDirs: DIRS,
			target: 200,
		});
		const core = jobs.filter((job) => job.zone === 'core');
		expect(core).toHaveLength(1);
		expect(core[0]?.name).toBe('core');
	});

	it('splits a zone that is too big, and says so in the name', () => {
		const jobs = planZones({
			specs: Array.from(
				{ length: 350 },
				(_, i) => `packages/core/a${i}.spec.ts`,
			),
			workspaceDirs: DIRS,
			target: 200,
		});
		const core = jobs.filter((job) => job.zone === 'core');
		expect(core).toHaveLength(2);
		expect(core.map((job) => job.name)).toEqual(['core 1/2', 'core 2/2']);
	});

	// Rounding, not ceiling: one spec over the target must not buy a
	// second runner five minutes of module loading to save nothing.
	it('does not split a zone that is barely over the target', () => {
		const jobs = planZones({
			specs: Array.from(
				{ length: 201 },
				(_, i) => `packages/core/a${i}.spec.ts`,
			),
			workspaceDirs: DIRS,
			target: 200,
		});
		expect(jobs.filter((job) => job.zone === 'core')).toHaveLength(1);
	});

	// A zone that disappears from the checks list because it happened
	// to be empty is indistinguishable from one that was forgotten.
	it('keeps a job for a zone with no specs at all', () => {
		const jobs = planZones({
			specs: [],
			workspaceDirs: DIRS,
			target: 200,
		});
		expect(jobs.map((job) => job.zone)).toContain('apps');
	});

	it('never points a plugins job at the proposals zone', () => {
		const jobs = planZones({
			specs: ['plugins/git/a.spec.ts'],
			workspaceDirs: DIRS,
			target: 200,
		});
		const plugins = jobs.find((job) => job.zone === 'plugins');
		expect(plugins?.paths).not.toContain('plugins/proposals');
		expect(plugins?.paths).toContain('plugins/git');
	});
});

describe('the split against this repository, not a fixture', () => {
	it('leaves no tracked spec file outside every job', () => {
		const files = tracked();
		const specs = files.filter((file) => file.endsWith('.spec.ts'));
		const dirs = [
			...new Set(
				files
					.filter((file) => file.endsWith('/package.json'))
					.map((file) => file.slice(0, -'/package.json'.length))
					.filter((dir) => dir.split('/').length === 2),
			),
		];
		const jobs = planZones({ specs, workspaceDirs: dirs });
		const filters = [...new Set(jobs.flatMap((job) => job.paths))];

		const orphans = specs.filter(
			(spec) => !filters.some((filter) => spec.startsWith(`${filter}/`)),
		);
		expect(orphans).toEqual([]);
		expect(specs.length).toBeGreaterThan(1000);
	});
});
