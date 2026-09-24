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

import {
	planZones,
	reachableZones,
	reachForBase,
	zoneOf,
} from './test-zones.script';

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

describe('splitting by cost rather than by count', () => {
	it('gives a zone whose specs are expensive the jobs it needs', () => {
		const cheap = planZones({
			specs: Array.from(
				{ length: 400 },
				(_, i) => `cheap/${String(i)}.spec.ts`,
			),
			workspaceDirs: ['cheap'],
			rules: [{ id: 'cheap', match: () => true, paths: () => ['cheap'] }],
			target: 200,
		});
		const dear = planZones({
			specs: Array.from(
				{ length: 400 },
				(_, i) => `dear/${String(i)}.spec.ts`,
			),
			workspaceDirs: ['dear'],
			rules: [
				{
					id: 'dear',
					match: () => true,
					paths: () => ['dear'],
					costWeight: 2.5,
				},
			],
			target: 200,
		});

		// Same number of specs, five times the work. Counting alone gave
		// the expensive zone two jobs while it needed five, which is how
		// ONE zone came to set the critical path of every pull request:
		// measured 816s against 387s for the next slowest.
		expect(cheap).toHaveLength(2);
		expect(dear).toHaveLength(5);
	});

	it('leaves a zone that declares no weight exactly as it was', () => {
		const rule = { id: 'plain', match: () => true, paths: () => ['plain'] };
		const withoutWeight = planZones({
			specs: Array.from(
				{ length: 200 },
				(_, i) => `plain/${String(i)}.spec.ts`,
			),
			workspaceDirs: ['plain'],
			rules: [rule],
			target: 200,
		});

		// Absent means 1, so the existing zones keep the split they had
		// and the change costs nothing where it was not needed.
		expect(withoutWeight).toHaveLength(1);
		expect(withoutWeight[0]?.name).toBe('plain');
	});
});

describe('reachableZones', () => {
	const graph = {
		rootDir: '/repo',
		dirToName: new Map([
			['packages/core', '@delendai/core'],
			['plugins/proposals', '@delendai/proposals'],
			['tools', 'tools'],
		]),
		nameToDeps: new Map(),
		nameToDependents: new Map(),
		workspaces: ['@delendai/core', '@delendai/proposals', 'tools'],
	};

	const result = (over: Record<string, unknown>) => ({
		mode: 'diff' as const,
		base: 'x',
		head: 'HEAD',
		rootFiles: [],
		directByWorkspace: new Map(),
		affected: [],
		upstream: [],
		downstream: [],
		vitestProjects: [],
		...over,
	});

	it('runs EVERYTHING when a file changed outside every workspace', () => {
		// A root config, a workflow or the lockfile can affect anything,
		// so nothing can say what it reaches. Fail open on "might this be
		// affected": the cost of being wrong is a false green.
		const reach = reachableZones(
			{ base: 'x', rootDir: '/repo' },
			{
				buildGraph: () => graph as never,
				computeAffected: () =>
					result({ rootFiles: ['package.json'] }) as never,
				diff: () => ['package.json'],
			},
		);

		expect(reach).toBeUndefined();
	});

	it('runs everything when the graph cannot be built at all', () => {
		const reach = reachableZones(
			{ base: 'x', rootDir: '/repo' },
			{
				buildGraph: () => {
					throw new Error('no workspaces');
				},
				computeAffected: () => result({}) as never,
				diff: () => [],
			},
		);

		expect(reach).toBeUndefined();
	});

	it('follows DOWNSTREAM only, never upstream', () => {
		// `affected` unions both because it answers a build-ordering
		// question: to build X, first build what X depends on. Test
		// selection asks the opposite — what could this change have
		// broken — and the answer never points at a dependency. Using
		// the union marked 51 workspaces reachable from a four-file
		// change to a CI script nothing depends on.
		const reach = reachableZones(
			{ base: 'x', rootDir: '/repo' },
			{
				buildGraph: () => graph as never,
				computeAffected: () =>
					result({
						directByWorkspace: new Map([['tools', ['tools/a.ts']]]),
						downstream: [],
						upstream: ['@delendai/core', '@delendai/proposals'],
						affected: [
							'tools',
							'@delendai/core',
							'@delendai/proposals',
						],
					}) as never,
				diff: () => ['tools/a.ts'],
			},
		);

		expect([...(reach ?? [])]).toEqual(['tools']);
	});

	it('includes the zones of workspaces that depend on what changed', () => {
		const reach = reachableZones(
			{ base: 'x', rootDir: '/repo' },
			{
				buildGraph: () => graph as never,
				computeAffected: () =>
					result({
						directByWorkspace: new Map([
							['@delendai/core', ['packages/core/a.ts']],
						]),
						downstream: ['@delendai/proposals'],
					}) as never,
				diff: () => ['packages/core/a.ts'],
			},
		);

		expect([...(reach ?? [])].sort()).toEqual(['core', 'proposals']);
	});
});

describe('reachForBase', () => {
	const asked: string[] = [];
	const reach = (base: string): ReadonlySet<string> => {
		asked.push(base);
		return new Set(['core']);
	};

	it('runs every zone when the run has no base, as a dispatch or a push does', () => {
		expect(reachForBase(undefined, reach)).toBeUndefined();
		expect(reachForBase('', reach)).toBeUndefined();
		expect(reachForBase('  ', reach)).toBeUndefined();
		expect(asked).toEqual([]);
	});

	it("filters by a pull request's base", () => {
		expect(reachForBase('abc123', reach)).toEqual(new Set(['core']));
		expect(asked).toEqual(['abc123']);
	});
});

describe('the workflow plans zones from a pull request base only', () => {
	it('never hands the planner a push base, so the integration branch runs the full matrix', async () => {
		const { readFileSync } = await import('node:fs');
		const workflow = readFileSync(
			join(import.meta.dirname, '../../../.github/workflows/ci.yml'),
			'utf8',
		);
		const planner = workflow.slice(
			workflow.indexOf('test-zones.script.ts --matrix'),
		);
		const base = planner.slice(
			0,
			planner.indexOf('\n', planner.indexOf('--base=')),
		);
		expect(base).toContain(
			"--base=${{ github.event.pull_request.base.sha || '' }}",
		);
		expect(base).not.toContain('github.event.before');
	});
});
