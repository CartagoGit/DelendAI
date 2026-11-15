/**
 * The decision that removes checking, so the cases are about what it
 * must REFUSE to remove.
 *
 * Every mistake this function can make is silent in one direction and
 * merely slow in the other. Running a job that was not needed costs a
 * few minutes; skipping a job that was needed ships a regression with a
 * green tick on it. So the default is always "run", and these cases pin
 * each of the ways that default has to survive: an unknown job, an
 * unreadable diff, and a scope that says `always`.
 */

import { describe, expect, it } from 'vitest';

import {
	CHANGED_OUTPUT_MAX_BYTES,
	JOB_SCOPES,
	changedOutputOf,
	explainJobs,
	isProse,
	jobMustRun,
	planJobs,
} from './job-scope.script';
import type { IJobScope } from './job-scope.interface';

const SCOPES: readonly IJobScope[] = [
	{ job: 'always-job', touches: 'always', because: 'test fixture' },
	{ job: 'web', touches: ['apps/web/'], because: 'test fixture' },
	{
		job: 'packaging',
		touches: ['packages/', 'package.json'],
		because: 'test fixture',
	},
];

const must = (job: string, changed: readonly string[]): boolean =>
	jobMustRun({ job, changed, scopes: SCOPES });

describe('jobMustRun — the ways "run" has to survive', () => {
	// The important one. A job nobody declared is a job nobody thought
	// about, and the answer to that is never "skip it".
	it('[<50ms] runs a job it has never heard of', () => {
		expect(must('some-new-job', ['docs/a.md'])).toBe(true);
	});

	// An empty diff is not evidence that nothing changed; it is what an
	// unreadable diff also looks like.
	it('[<50ms] runs everything when the change list is empty', () => {
		expect(must('web', [])).toBe(true);
		expect(must('packaging', [])).toBe(true);
	});

	it('[<50ms] runs a job declared always, whatever changed', () => {
		expect(must('always-job', ['docs/a.md'])).toBe(true);
	});
});

describe('jobMustRun — the bounded decision', () => {
	it('[<50ms] runs a bounded job when the change is inside its bound', () => {
		expect(must('web', ['apps/web/src/pages/index.astro'])).toBe(true);
	});

	it('[<50ms] skips a bounded job when nothing it reads was touched', () => {
		expect(must('web', ['docs/a.md'])).toBe(false);
	});

	it('[<50ms] runs when ANY one of several changed files is in scope', () => {
		expect(
			must('web', ['docs/a.md', 'apps/web/src/a.ts', 'README.md']),
		).toBe(true);
	});

	it('[<50ms] matches a bare file, not only a directory prefix', () => {
		expect(must('packaging', ['package.json'])).toBe(true);
	});

	// `packages/` must not be satisfied by `packages-old/` — a prefix
	// that accidentally matches a neighbour would run jobs needlessly,
	// but one that accidentally fails to match would skip them.
	it('[<50ms] does not match a sibling path that merely starts the same', () => {
		expect(must('web', ['apps/website/src/a.ts'])).toBe(false);
	});
});

describe('planJobs', () => {
	it('[<50ms] answers for every declared job and nothing else', () => {
		const plan = planJobs({ changed: ['docs/a.md'], scopes: SCOPES });
		expect(Object.keys(plan).sort()).toEqual([
			'always-job',
			'packaging',
			'web',
		]);
	});

	it('[<50ms] reports the skips as false rather than omitting them', () => {
		expect(planJobs({ changed: ['docs/a.md'], scopes: SCOPES })).toEqual({
			'always-job': true,
			web: false,
			packaging: false,
		});
	});
});

describe('explainJobs', () => {
	it('[<50ms] agrees with the plan for every job, whatever changed', () => {
		for (const changed of [[], ['docs/a.md'], ['apps/web/a.astro']]) {
			expect(
				Object.fromEntries(
					explainJobs({ changed, scopes: SCOPES }).map((each) => [
						each.job,
						each.runs,
					]),
				),
			).toEqual(planJobs({ changed, scopes: SCOPES }));
		}
	});

	it('[<50ms] names the file that makes a bounded job run, and the bound that lets it skip', () => {
		const said = explainJobs({
			changed: ['docs/a.md', 'apps/web/a.astro'],
			scopes: SCOPES,
		});
		expect(said.find((each) => each.job === 'web')?.why).toBe(
			'apps/web/a.astro changed',
		);
		expect(said.find((each) => each.job === 'packaging')?.why).toMatch(
			/^no changed file is under /u,
		);
		expect(said.find((each) => each.job === 'always-job')?.why).toMatch(
			/^declared always/u,
		);
	});

	it('[<50ms] says that nothing is skipped when there is no change list', () => {
		expect(
			explainJobs({ changed: [], scopes: SCOPES }).every(
				(each) => each.runs && each.why.length > 0,
			),
		).toBe(true);
	});
});

/**
 * Against the real table, not a fixture.
 *
 * The declarations are the thing being trusted, so the invariants they
 * must hold are checked on them directly: nothing is declared twice,
 * and every bound carries the reason it is correct. A bound without a
 * reason is a guess that looks like a decision.
 */
describe('the site build runs when what it bundles changes (x00726)', () => {
	it('[<50ms] runs for the CLI, core, the proposal store and a plugin, not only apps/web', () => {
		for (const changed of [
			'packages/cli/src/lib/validate-run.service.ts',
			'packages/core/src/public/index.ts',
			'packages/proposals-sqlite/src/lib/migrations.ts',
			'plugins/proposals/src/lib/shared/validate-journal.ts',
			'apps/web/src/pages/index.astro',
		]) {
			expect(
				jobMustRun({
					job: 'site',
					changed: [changed],
					scopes: JOB_SCOPES,
				}),
				changed,
			).toBe(true);
		}
	});

	it('[<50ms] still skips it for a change to documentation alone', () => {
		expect(
			jobMustRun({
				job: 'site',
				changed: ['docs/delendai/proposals/review/x00001-a.md'],
				scopes: JOB_SCOPES,
			}),
		).toBe(false);
	});
});

describe('the declarations themselves', () => {
	it('[<50ms] declares each job exactly once', () => {
		const ids = JOB_SCOPES.map((scope) => scope.job);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('[<50ms] gives every bound a stated reason', () => {
		for (const scope of JOB_SCOPES) {
			expect(scope.because.length).toBeGreaterThan(20);
		}
	});

	it('[<50ms] never declares an empty bound, which would skip the job forever', () => {
		for (const scope of JOB_SCOPES) {
			if (scope.touches === 'always' || scope.group !== undefined)
				continue;
			expect(scope.touches.length).toBeGreaterThan(0);
		}
	});

	// The aggregate that gates every merge cannot be one of the jobs a
	// change is allowed to skip.
	it('[<50ms] keeps the required aggregate unconditional', () => {
		const validate = JOB_SCOPES.find(
			(scope) => scope.job === 'delendai-validate',
		);
		expect(validate?.touches).toBe('always');
	});

	it('[<50ms] keeps the job that decides the skips unconditional', () => {
		expect(
			JOB_SCOPES.find((scope) => scope.job === 'plan-scope')?.touches,
		).toBe('always');
	});
});

describe('source-bearing jobs are proportional (x00571)', () => {
	const SOURCE_SCOPED = ['typecheck', 'plan-tests', 'tests-zone', 'tests'];

	it('[<50ms] skips compiling and testing only when no source changed at all', () => {
		const plan = planJobs({
			changed: ['docs/delendai/proposals/review/x00571-a.md'],
		});
		for (const job of SOURCE_SCOPED) expect(plan[job]).toBe(false);
	});

	it('[<50ms] runs them for a change anywhere a .ts file can live', () => {
		for (const file of [
			'packages/core/src/public/index.ts',
			'plugins/git/src/lib/x.ts',
			'apps/web/src/x.ts',
			'extensions/vscode/src/x.ts',
			'tools/scripts/ci/job-scope.script.ts',
			'tests/e2e/x.spec.ts',
		]) {
			const plan = planJobs({ changed: [file] });
			for (const job of SOURCE_SCOPED) {
				expect(`${file}:${job}:${String(plan[job])}`).toBe(
					`${file}:${job}:true`,
				);
			}
		}
	});

	it('[<50ms] runs them for a root file that changes how source compiles or runs', () => {
		for (const file of [
			'package.json',
			'bun.lock',
			'tsconfig.json',
			'tsconfig.base.json',
			'vitest.shared.ts',
			'biome.json',
			'delendai.config.json',
		]) {
			const plan = planJobs({ changed: [file] });
			for (const job of SOURCE_SCOPED) {
				expect(`${file}:${job}:${String(plan[job])}`).toBe(
					`${file}:${job}:true`,
				);
			}
		}
	});

	it('[<50ms] runs them when a docs change arrives alongside any source', () => {
		const plan = planJobs({
			changed: ['docs/delendai/x.md', 'packages/core/src/x.ts'],
		});
		for (const job of SOURCE_SCOPED) expect(plan[job]).toBe(true);
	});

	it('[<50ms] never lets the coverage verdict run over a suite that did not', () => {
		// `tests` computes coverage from what `tests-zone` produced. If the
		// two could disagree, a change could get a coverage verdict over an
		// empty scan root — a gate passing having measured nothing.
		for (const changed of [
			['docs/delendai/x.md'],
			['packages/core/src/x.ts'],
			['.github/workflows/ci.yml'],
		]) {
			const plan = planJobs({ changed });
			expect(plan.tests).toBe(plan['tests-zone']);
			expect(plan.tests).toBe(plan['plan-tests']);
		}
	});
});

/** Files whose change must select the packaging jobs. */
const PACKAGING_CASES: readonly (readonly [string, readonly string[]])[] = [
	['tools/scripts/compile/build.script.ts', ['build-clean', 'pack-smoke']],
	[
		'tools/scripts/compile/build-clean.script.ts',
		['build-clean', 'pack-smoke'],
	],
	['tools/scripts/smoke/pack.script.ts', ['pack-smoke']],
	['tools/scripts/verify/external-install-smoke.script.ts', ['pack-smoke']],
	['packages/cli/src/lib/init/init-plan.service.ts', ['pack-smoke']],
];

describe('planJobs — a change to a job’s own scripts runs that job', () => {
	it.each(PACKAGING_CASES)('[<50ms] %s selects %j', (file, jobs) => {
		const plan = planJobs({ changed: [file] });
		for (const job of jobs) expect(plan[job]).toBe(true);
	});
});

describe('a change made only of prose', () => {
	it('[<50ms] skips the jobs that judge code, and only when every changed file is prose', () => {
		const prose = ['docs/delendai/proposals/review/x1.md', 'README.md'];
		expect(prose.every(isProse)).toBe(true);
		expect(isProse('plugins/a/README.md')).toBe(false);
		expect(jobMustRun({ job: 'lint-biome', changed: prose })).toBe(false);
		expect(jobMustRun({ job: 'lint-governance', changed: prose })).toBe(
			true,
		);
		expect(
			jobMustRun({
				job: 'lint-biome',
				changed: [...prose, 'package.json'],
			}),
		).toBe(true);
	});
});

describe('pack smoke', () => {
	it('[<50ms] runs when a tarball can change, and not for an edit inside a module', () => {
		const runs = (file: string) =>
			jobMustRun({ job: 'pack-smoke', changed: [file], structural: [] });
		expect(
			runs('packages/core/src/lib/cache/cache-layout-bootstrap.ts'),
		).toBe(false);
		expect(runs('plugins/proposals/package.json')).toBe(true);
		expect(runs('packages/core/src/cli.ts')).toBe(true);
		expect(runs('packages/core/src/public/index.ts')).toBe(true);
		expect(runs('bun.lock')).toBe(true);
		expect(runs('tools/scripts/compile/build.script.ts')).toBe(true);
	});
});

describe('the lint families and the typecheck run for what the change touches (q00038)', () => {
	const FAMILIES = [
		'lint-biome',
		'lint-architecture',
		'lint-presets',
		'lint-docs',
		'lint-security',
		'lint-governance',
		'quality-gate',
		'manifests-check',
		'generated-artifacts-check',
		'typecheck',
	];
	const ran = (changed: readonly string[]): readonly string[] => {
		const plan = planJobs({ changed, structural: [], reached: new Set() });
		return FAMILIES.filter((job) => plan[job] === true);
	};

	it('[<50ms] runs every family for a one-file core change, since each reads core', () => {
		expect(
			ran(['packages/core/src/lib/shared/compute-slot.service.ts']),
		).toEqual(FAMILIES);
	});

	it('[<50ms] runs every family for a plugin-only change, since each reads the plugins', () => {
		expect(ran(['plugins/memory/src/memory.tool.ts'])).toEqual(FAMILIES);
	});

	it('[<50ms] skips Biome, the manifests and the typecheck for a docs-only change', () => {
		expect(ran(['docs/delendai/guide.md'])).toEqual([
			'lint-architecture',
			'lint-presets',
			'lint-docs',
			'lint-security',
			'lint-governance',
			'quality-gate',
			'generated-artifacts-check',
		]);
	});

	it('[<50ms] still checks a hand edit to a generated manifest page', () => {
		expect(
			ran(['docs/delendai/plugins/auto-generated/memory.md']),
		).toContain('manifests-check');
	});

	it('[<50ms] skips the families that read no workflow for a workflow-only change', () => {
		const families = ran(['.github/workflows/ci.yml']);
		expect(families).not.toContain('lint-biome');
		expect(families).not.toContain('manifests-check');
		expect(families).not.toContain('typecheck');
		expect(families).toContain('lint-docs');
	});

	it('[<50ms] declares a measured reason for every lint family left always', () => {
		for (const scope of JOB_SCOPES.filter((each) =>
			each.job.startsWith('lint-'),
		)) {
			if (scope.touches === 'always')
				expect(scope.because).toMatch(/^measured: /u);
		}
	});
});

describe('jobMustRun — listings and the scripts a job runs', () => {
	const scopes: readonly IJobScope[] = [
		{
			job: 'walks-docs',
			touches: ['docs/a.md'],
			lists: ['docs/'],
			because: 'test fixture',
		},
		{
			job: 'imports-core',
			touches: ['docs/'],
			code: 'scripts',
			because: 'test fixture',
		},
	];
	const decide = (
		job: string,
		changed: readonly string[],
		more: { structural?: readonly string[]; reached?: ReadonlySet<string> },
	) => jobMustRun({ job, changed, scopes, ...more });

	it('[<50ms] runs a job that lists a folder when a file is added there, not when one is edited', () => {
		expect(
			decide('walks-docs', ['docs/b.md'], { structural: ['docs/b.md'] }),
		).toBe(true);
		expect(decide('walks-docs', ['docs/b.md'], { structural: [] })).toBe(
			false,
		);
		// Without the list of additions, every changed path counts as one.
		expect(decide('walks-docs', ['docs/b.md'], {})).toBe(true);
	});

	it('[<50ms] runs a job when the change reaches its scripts by symbol, and only then', () => {
		const changed = ['packages/core/src/x.ts'];
		expect(
			decide('imports-core', changed, {
				reached: new Set(['imports-core']),
			}),
		).toBe(true);
		expect(decide('imports-core', changed, { reached: new Set() })).toBe(
			false,
		);
		// Without the analysis, its scripts count as reached.
		expect(decide('imports-core', changed, {})).toBe(true);
	});

	it('[<50ms] says why in the sentence the log prints', () => {
		const said = explainJobs({
			changed: ['packages/core/src/x.ts'],
			scopes,
			structural: [],
			reached: new Set(['imports-core']),
		});
		expect(said.find((each) => each.job === 'imports-core')?.why).toBe(
			'the change reaches its scripts by symbol',
		);
		expect(said.find((each) => each.job === 'walks-docs')?.why).toBe(
			'no changed file is under what it reads (docs/a.md)',
		);
	});
});

describe('changedOutputOf', () => {
	it('[<50ms] passes the change list on as JSON, and nothing past the output limit', () => {
		expect(changedOutputOf(['a.ts', 'b.md'])).toBe('["a.ts","b.md"]');
		expect(
			changedOutputOf(
				Array.from(
					{ length: CHANGED_OUTPUT_MAX_BYTES / 4 },
					(_, i) => `f${i}.ts`,
				),
			),
		).toBe('');
	});
});

describe('an edit of the test workflow runs the jobs whose block changed', () => {
	const scopes: readonly IJobScope[] = [
		...SCOPES,
		{ job: 'reads-github', touches: ['.github/'], because: 'test fixture' },
	];
	const ci = '.github/workflows/ci.yml';
	const runs = (job: string, changed: readonly string[]): boolean =>
		jobMustRun({
			job,
			changed,
			scopes,
			workflowJobs: new Set(['web']),
		});

	it('[<50ms] runs a job whose block changed, though nothing it reads did', () => {
		expect(runs('web', [ci])).toBe(true);
	});

	it('[<50ms] runs no other job for the workflow alone, save one declared always', () => {
		expect(runs('reads-github', [ci])).toBe(false);
		expect(runs('packaging', [ci])).toBe(false);
		expect(runs('always-job', [ci])).toBe(true);
	});

	it('[<50ms] still runs what the rest of the change reaches', () => {
		expect(runs('packaging', [ci, 'packages/core/a.ts'])).toBe(true);
	});

	it('[<50ms] counts the workflow as a read when its blocks are unknown', () => {
		expect(jobMustRun({ job: 'reads-github', changed: [ci], scopes })).toBe(
			true,
		);
	});
});

describe('the jobs the real scopes run, by kind of change', () => {
	const real = (changed: readonly string[]): readonly string[] =>
		Object.entries(
			planJobs({
				changed,
				scopes: JOB_SCOPES,
				structural: [],
				reached: new Set<string>(),
			}),
		)
			.filter(([, runs]) => runs)
			.map(([job]) => job);

	// #1838 carried a proposal document, and it ran 31 jobs.
	it('[<50ms] runs the whole-repository checks and the bookkeeping for a proposal edit', () => {
		expect(
			real(['docs/delendai/proposals/ready/perfs/v00155-x.md']),
		).toEqual([
			'lint-architecture',
			'lint-presets',
			'lint-docs',
			'lint-security',
			'lint-governance',
			'static-checks',
			'plan-scope',
			'quality-gate',
			'delendai-validate',
			'integration-signal',
			'generated-artifacts-check',
		]);
	});

	it('[<50ms] runs no live-forge, build, site or packaging job for a change under tools/', () => {
		const run = real([
			'tools/scripts/ci/test-scope.ts',
			'tools/scripts/ci/test-scope.spec.ts',
		]);
		for (const job of [
			'ref-lifecycle',
			'develop-protection-live',
			'metrics-gate',
			'pack-smoke',
			'build-clean',
			'delendai-rebuild-digest',
			'tokens-budget-real',
		])
			expect(run).not.toContain(job);
		expect(run).toContain('typecheck');
	});

	it('[<50ms] runs the forge guards when the policy they resolve changes', () => {
		expect(
			real(['tools/scripts/governance/forge-settings.lib.ts']),
		).toEqual(
			expect.arrayContaining([
				'ref-lifecycle',
				'develop-protection-live',
			]),
		);
	});

	it('[<50ms] declares a one-line reason for every job that reads the whole repository', () => {
		const always = JOB_SCOPES.filter((scope) => scope.touches === 'always');
		expect(always.map((scope) => scope.job).sort()).toEqual([
			'delendai-validate',
			'generated-artifacts-check',
			'integration-signal',
			'lint-architecture',
			'lint-governance',
			'lint-security',
			'plan-scope',
			'quality-gate',
		]);
		for (const scope of always) {
			expect(scope.because).not.toContain('\n');
			expect(scope.because.length).toBeLessThanOrEqual(160);
		}
	});
});

describe('the packaging jobs judge a published surface by the names it exports', () => {
	const PACKAGING = [
		'site',
		'pack-smoke',
		'build-clean',
		'verify-runtime',
		'delendai-rebuild-digest',
	] as const;
	const ran = (input: {
		readonly changed: readonly string[];
		readonly moved?: readonly string[];
		readonly structural?: readonly string[];
	}): readonly string[] => {
		const plan = planJobs({
			changed: input.changed,
			scopes: JOB_SCOPES,
			structural: input.structural ?? [],
			reached: new Set<string>(),
			surfaceMoved: new Set(input.moved ?? []),
		});
		return PACKAGING.filter((job) => plan[job] === true);
	};
	const BARREL = 'packages/core/src/cli.ts';

	it('[<50ms] runs none of them when a barrel changed and no name it exports moved', () => {
		expect(ran({ changed: [BARREL] })).toEqual([]);
	});

	it('[<50ms] runs the four that read a public surface when the barrel gained an export (#1838)', () => {
		expect(ran({ changed: [BARREL], moved: [BARREL] })).toEqual([
			'site',
			'pack-smoke',
			'build-clean',
			'verify-runtime',
		]);
	});

	it('[<50ms] runs none of them for a change inside a module behind the barrel', () => {
		expect(
			ran({
				changed: [
					'packages/core/src/lib/shared/model-catalogue.service.ts',
				],
			}),
		).toEqual([]);
	});

	it('[<50ms] runs them for a file added or removed in a package, and for a manifest', () => {
		expect(
			ran({
				changed: ['packages/core/src/lib/new.ts'],
				structural: ['packages/core/src/lib/new.ts'],
			}),
		).toEqual(['site', 'pack-smoke', 'build-clean', 'verify-runtime']);
		expect(ran({ changed: ['packages/core/package.json'] })).toEqual([
			'site',
			'pack-smoke',
			'build-clean',
			'verify-runtime',
			'delendai-rebuild-digest',
		]);
	});

	it('[<50ms] runs every one of them when the analysis is absent: the cautious reading', () => {
		const plan = planJobs({
			changed: [BARREL],
			scopes: JOB_SCOPES,
			structural: [],
			reached: new Set<string>(),
		});
		for (const job of PACKAGING.filter(
			(each) => each !== 'delendai-rebuild-digest',
		))
			expect(plan[job]).toBe(true);
	});
});

describe('the static checks share one job', () => {
	const STATIC = JOB_SCOPES.find((scope) => scope.job === 'static-checks');
	const plan = (
		changed: readonly string[],
	): Readonly<Record<string, boolean>> =>
		planJobs({
			changed,
			scopes: JOB_SCOPES,
			structural: [],
			reached: new Set<string>(),
		});

	it('[<50ms] is made of checks that each keep their own entry', () => {
		const names = JOB_SCOPES.map((scope) => scope.job);
		expect(STATIC?.group?.length).toBe(8);
		for (const member of STATIC?.group ?? [])
			expect(names).toContain(member);
	});

	it('[<50ms] runs when any of its checks can be affected, and says which', () => {
		expect(
			plan(['docs/delendai/proposals/ready/perfs/x.md'])['static-checks'],
		).toBe(true);
		const [line] = explainJobs({
			changed: ['plugins/proposals/src/a.ts'],
			scopes: JOB_SCOPES.filter(
				(scope) =>
					scope.job === 'static-checks' ||
					STATIC?.group?.includes(scope.job),
			),
			structural: [],
			reached: new Set<string>(),
		}).filter((each) => each.job === 'static-checks');
		expect(line?.runs).toBe(true);
		expect(line?.why).toMatch(/^[a-z-]+: /u);
	});

	it('[<50ms] does not run when none of its checks can be affected', () => {
		const scopes: readonly IJobScope[] = [
			{ job: 'one', touches: ['a/'], because: 'fixture' },
			{ job: 'two', touches: ['b/'], because: 'fixture' },
			{
				job: 'both',
				touches: [],
				group: ['one', 'two'],
				because: 'fixture',
			},
		];
		expect(
			planJobs({ changed: ['c/x.ts'], scopes, structural: [] }).both,
		).toBe(false);
		expect(
			planJobs({ changed: ['b/x.ts'], scopes, structural: [] }).both,
		).toBe(true);
	});
});
