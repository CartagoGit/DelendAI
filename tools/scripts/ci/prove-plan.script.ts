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
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { availableParallelism } from 'node:os';

import { RUN_ALONE, staticChecksOf } from './ci-static-steps';
import { jobMustRun } from './job-scope.script';

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

/** The gate CI runs in a job of its own, beside the static checks. */
export const PROVE_GATES: readonly (readonly string[])[] = [
	['bun', 'run', 'typecheck'],
];

/** What failed, said last: a caller keeps only the tail of the output. */
const failed: string[] = [];

/** The lines that say why, printed last with it. */
const causes: string[] = [];

const CAUSE_LINE =
	/✖|\bFAIL\b|\(fail\)|error TS\d+|\bHARD BREACH\b|\b[1-9]\d* violations? across\b|\bunder floor\b|\bunmatched files\b|^\s*drift: |^\s*manifest budget: /u;

/** How many lines of one failed step are kept as its cause. */
const MAX_CAUSE_LINES = 4;

/** The lines of a failed step's output that name the cause. Pure. */
export const causeLinesOf = (output: string): readonly string[] =>
	[
		...new Set(
			output
				.split('\n')
				// biome-ignore lint/suspicious/noControlCharactersInRegex: colour codes
				.map((line) => line.replace(/\u001b\[[0-9;]*m/gu, '').trim())
				.filter((line) => CAUSE_LINE.test(line)),
		),
	].slice(0, MAX_CAUSE_LINES);

const printCauses = (): void => {
	for (const cause of causes) console.error(`prove: why ${cause}`);
};

/** How many lines of a failed check's output the proof prints. */
const FAILED_TAIL_LINES = 30;

/** Run labelled bash scripts at once, at most `limit` together. */
const runTogether = async (
	scripts: readonly (readonly [string, string])[],
	limit: number,
): Promise<boolean> => {
	let ok = true;
	const queue = [...scripts];
	const worker = async (): Promise<void> => {
		for (
			let next = queue.shift();
			next !== undefined;
			next = queue.shift()
		) {
			const [label, script] = next;
			const started = Date.now();
			const { code, output } = await new Promise<{
				code: number | null;
				output: string;
			}>((done) => {
				let output = '';
				// stdin closed: a check that reads it (as a pre-push hook does)
				// must see an end, not wait for one.
				const child = spawn(
					'bash',
					['-euo', 'pipefail', '-c', script],
					{
						stdio: ['ignore', 'pipe', 'pipe'],
						env: { ...process.env, VITEST_CHANGED_RUN: 'true' },
					},
				);
				child.stdout.on('data', (chunk) => {
					output += String(chunk);
				});
				child.stderr.on('data', (chunk) => {
					output += String(chunk);
				});
				child.on('close', (status) => done({ code: status, output }));
			});
			const passed = code === 0;
			ok = passed && ok;
			if (!passed) {
				failed.push(label);
				causes.push(...causeLinesOf(output));
			}
			console.log(
				`prove: ${passed ? 'ok  ' : 'FAIL'} ${label} (${String(Math.round((Date.now() - started) / 1000))}s)`,
			);
			if (!passed) {
				console.log(
					output
						.trimEnd()
						.split('\n')
						.slice(-FAILED_TAIL_LINES)
						.join('\n'),
				);
			}
		}
	};
	await Promise.all(
		Array.from(
			{ length: Math.max(1, Math.min(limit, scripts.length)) },
			worker,
		),
	);
	return ok;
};

/**
 * The checks every pull request runs before its tests, read from ci.yml:
 * the typecheck and the static checks together, then those that must run
 * alone.
 */
const runChecks = async (
	base: string,
	changed: readonly string[],
): Promise<boolean> => {
	// What the forge would run for this change: a check it skips proves
	// nothing here either.
	const checks = staticChecksOf(
		readFileSync('.github/workflows/ci.yml', 'utf8'),
		base,
		'develop',
	).filter((check) => jobMustRun({ job: check.job, changed }));
	const first = await runTogether(
		[
			...(jobMustRun({ job: 'typecheck', changed })
				? PROVE_GATES
				: []
			).map(
				(command) =>
					[command.slice(1).join(' '), command.join(' ')] as const,
			),
			...checks
				.filter((check) => !RUN_ALONE.has(check.job))
				.map((check) => [check.job, check.script] as const),
		],
		availableParallelism(),
	);
	const alone = await runTogether(
		checks
			.filter((check) => RUN_ALONE.has(check.job))
			.map((check) => [check.job, check.script] as const),
		1,
	);
	return first && alone;
};

const step = (label: string, command: readonly string[]): boolean => {
	const started = Date.now();
	const [bin = 'bun', ...rest] = command;
	const result = spawnSync(bin, rest, {
		stdio: ['ignore', 'pipe', 'pipe'],
		encoding: 'utf8',
		maxBuffer: Number.POSITIVE_INFINITY,
		env: { ...process.env, VITEST_CHANGED_RUN: 'true' },
	});
	process.stderr.write(result.stderr ?? '');
	const ok = result.status === 0;
	if (!ok) {
		failed.push(label);
		causes.push(
			...causeLinesOf(`${result.stdout ?? ''}\n${result.stderr ?? ''}`),
		);
	}
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
	// drift.yml, not ci.yml, holds this one: #1621 went red on a stale
	// AGENT.md after a proof that never looked.
	['generated files are current', ['bun', 'run', 'gen:all:check']],
];

const main = async (): Promise<number> => {
	const base = execFileSync(
		'git',
		['merge-base', arg('base') ?? 'origin/develop', 'HEAD'],
		{ encoding: 'utf8' },
	).trim();
	const started = Date.now();
	// The last proof's output: a check of it fails a proof run twice.
	rmSync('build', { recursive: true, force: true });
	if (process.argv.includes('--fast')) {
		const root = process.cwd();
		const changed = changedSince(root, base);
		let ok = await runChecks(base, changed);
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
		printCauses();
		console.error(
			`prove: ${ok ? 'PROVED' : `NOT PROVED, failed: ${failed.join(', ')};`} (fast) in ${String(Math.round((Date.now() - started) / 1000))}s against ${base.slice(0, 9)}`,
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
	let ok = await runChecks(base, changedSince(process.cwd(), base));
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
	printCauses();
	console.log(
		`prove: ${ok ? 'PROVED' : 'NOT PROVED'} in ${String(Math.round((Date.now() - started) / 1000))}s against ${base.slice(0, 9)}`,
	);
	return ok ? 0 : 1;
};

if (import.meta.main) process.exit(await main());
