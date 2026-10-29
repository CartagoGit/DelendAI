#!/usr/bin/env bun
/**
 * prove-plan.script.ts — prove a change before it is pushed, by the plan
 * CI will follow for it.
 *
 *   bun run prove [-- --base=<ref>]       the fast proof (default base: origin/develop)
 *   bun run prove:plan [-- --base=<ref>]  the plan CI will follow, in full
 *
 * The local proof used to be a second, bigger CI: every zone, every lint
 * preset, about 45 minutes a unit, and then the forge ran its own plan
 * anyway. This asks the zone planner for the same matrix CI reads, runs
 * what each job would run (the specs the imports reach, the specs that
 * read a changed file, or the zone unfiltered), then the typecheck and the
 * repository-wide gates every pull request runs. It prints the plan, the
 * time of each step and the verdict.
 *
 * `--fast` (`bun run prove`) is the proof `work publish` runs before a
 * unit becomes a pull request: the same gates, then the specs nearest the
 * change (`near-specs.ts`) with the coverage of the touched files, and the
 * bun suite when state or proposals code changed. About 90 s where the
 * plan takes minutes; the forge still runs the plan, and is the authority.
 */
import { execFileSync, spawnSync } from 'node:child_process';

import { changedSince, nearSpecsSince } from './near-specs';
import type { IProveJob } from './prove-plan.interface';

const arg = (name: string): string | undefined =>
	process.argv
		.find((value) => value.startsWith(`--${name}=`))
		?.slice(name.length + 3);

/** What one matrix job runs, as the vitest arguments CI would pass. */
export const vitestArgsOf = (
	job: IProveJob,
	base: string,
): readonly string[] | undefined => {
	if (!job.run) return undefined;
	if (job.filter === 'readers')
		return job.readers.split(/\s+/u).filter(Boolean);
	const paths = job.paths.split(/\s+/u).filter(Boolean);
	return job.filter === 'changed'
		? [...paths, `--shard=${job.shard}`, '--changed', base]
		: [...paths, `--shard=${job.shard}`];
};

/** The repository-wide gates every pull request runs, cheapest first. */
export const PROVE_GATES: readonly (readonly string[])[] = [
	['bun', 'run', 'typecheck'],
	['bun', 'tools/scripts/lint/biome-baseline.script.ts'],
	['bun', 'run', 'lint:architecture'],
	['bun', 'run', 'lint:proposals'],
];

const step = (label: string, command: readonly string[]): boolean => {
	const started = Date.now();
	const [bin = 'bun', ...rest] = command;
	const result = spawnSync(bin, rest, {
		stdio: ['ignore', 'ignore', 'inherit'],
		env: { ...process.env, VITEST_CHANGED_RUN: 'true' },
	});
	const ok = result.status === 0;
	console.log(
		`prove: ${ok ? 'ok  ' : 'FAIL'} ${label} (${String(Math.round((Date.now() - started) / 1000))}s)`,
	);
	return ok;
};

/** Where a change needs the bun-only suite, which vitest never runs. */
const BUN_SUITE =
	/^(plugins\/proposals|packages\/proposals-sqlite|packages\/state-sqlite)\//u;

/** The fast proof's test steps, for the paths a change touched. */
export const fastSteps = (
	changed: readonly string[],
	specs: readonly string[],
	base: string,
): readonly (readonly [string, readonly string[]])[] => [
	...(specs.length === 0
		? []
		: ([
				[
					'tests: the specs nearest the change',
					[
						'npx',
						'vitest',
						'run',
						'--coverage',
						'--passWithNoTests',
						...specs,
					],
				],
				[
					'changed-file coverage',
					[
						'bun',
						'tools/scripts/ci/changed-file-coverage.script.ts',
						`--base=${base}`,
					],
				],
			] as const)),
	...(changed.some((path) => BUN_SUITE.test(path))
		? ([['test:sqlite', ['bun', 'run', 'test:sqlite']]] as const)
		: []),
];

const main = (): number => {
	const base = execFileSync(
		'git',
		['merge-base', arg('base') ?? 'origin/develop', 'HEAD'],
		{ encoding: 'utf8' },
	).trim();
	const started = Date.now();
	if (process.argv.includes('--fast')) {
		const root = process.cwd();
		const changed = changedSince(root, base);
		let ok = true;
		for (const command of PROVE_GATES) {
			ok = step(command.slice(1).join(' '), command) && ok;
		}
		// Coverage instruments only what the change touched, as the forge
		// does on a pull request (vitest.config.ts).
		process.env.VITEST_COVERAGE_FILES = changed.join('\n');
		for (const [label, command] of fastSteps(
			changed,
			nearSpecsSince(root, base),
			base,
		)) {
			ok = step(label, command) && ok;
		}
		console.log(
			`prove: ${ok ? 'PROVED' : 'NOT PROVED'} (fast) in ${String(Math.round((Date.now() - started) / 1000))}s against ${base.slice(0, 9)}`,
		);
		return ok ? 0 : 1;
	}
	const jobs = JSON.parse(
		execFileSync(
			'bun',
			[
				'tools/scripts/ci/test-zones.script.ts',
				'--matrix',
				`--base=${base}`,
			],
			{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
		),
	) as readonly IProveJob[];
	let ok = true;
	for (const command of PROVE_GATES) {
		ok = step(command.slice(1).join(' '), command) && ok;
	}
	for (const job of jobs) {
		const args = vitestArgsOf(job, base);
		if (args === undefined) continue;
		ok =
			step(`tests: ${job.name} (${job.filter})`, [
				'npx',
				'vitest',
				'run',
				...args,
				'--passWithNoTests',
			]) && ok;
	}
	console.log(
		`prove: ${ok ? 'PROVED' : 'NOT PROVED'} in ${String(Math.round((Date.now() - started) / 1000))}s against ${base.slice(0, 9)}`,
	);
	return ok ? 0 : 1;
};

if (import.meta.main) process.exit(main());
