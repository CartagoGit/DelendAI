#!/usr/bin/env bun
/**
 * prove-plan.script.ts — prove a change before it is pushed, by the plan
 * CI will follow for it.
 *
 *   bun run prove [-- --base=<ref>]       the fast proof (default base: the policy's integration branch)
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
import {
	appendFileSync,
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join } from 'node:path';

import {
	RUN_ALONE,
	STATIC_CHECK_JOBS as STATIC_CHECK_FAMILIES,
	staticChecksOf,
} from './ci-static-steps';
import {
	declaredBranches,
	declaredIntegrationRef,
} from '../lib/declared-branches';
import { CHANGED_FILES_ENV } from '../lib/changed-files-scope';
import {
	changedSince as changedWithDeletionsSince,
	explainJobs,
	type IPlanInput,
	jobMustRun,
	planInputSince,
} from './job-scope.script';

import { touchesIntegrationMachinery } from '../forge/land-rehearsal';
import { changedSince, nearSpecsSince } from './near-specs';
import type { IProveJob } from './prove-plan.interface';
import { bunSuiteCommand, splitByRunner } from './bun-near-specs';
import { chooseSelectionBase } from './proved-ancestors';
import {
	proofGitReader,
	proofStorePath,
	readProofs,
	recordPassedProof,
} from './proved-ancestors.store';
import {
	createStepReuse,
	type IStepReuse,
	reusedLine,
	reuseForbidden,
} from './step-reuse';

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

/**
 * The gate CI runs in a job of its own, beside the static checks: the
 * typecheck of the workspaces the change reaches, as the pull request runs it.
 */
export const proveGatesOf = (base: string): readonly (readonly string[])[] => [
	['bun', 'run', 'typecheck', '--', `--base=${base}`],
];

/**
 * Which check families run for this change and why the others do not, in the
 * sentences the pull request's plan-scope job prints. Pure.
 */
export const familyPlanOf = (input: IPlanInput): readonly string[] => {
	const families = new Set<string>(['typecheck', ...STATIC_CHECK_FAMILIES]);
	return explainJobs(input)
		.filter((each) => families.has(each.job))
		.map(
			(each) =>
				`prove: ${each.runs ? 'run ' : 'skip'} ${each.job} — ${each.why}`,
		);
};

/** The store of passed steps, beside the proved commits every worktree shares. */
const stepStorePath = (root: string): string | undefined => {
	const proved = proofStorePath(root);
	return proved === undefined
		? undefined
		: join(dirname(proved), 'passed-steps.json');
};

/** Reuse of this proof's steps, over this checkout and its machine-level store. */
const stepReuse: IStepReuse = ((): IStepReuse => {
	const root = process.cwd();
	const path = stepStorePath(root);
	return createStepReuse(
		{
			git: (args) =>
				execFileSync('git', [...args], {
					cwd: root,
					encoding: 'utf8',
					maxBuffer: 256 * 1024 * 1024,
					stdio: ['ignore', 'pipe', 'ignore'],
				}).trim(),
			read: () => {
				try {
					return path === undefined
						? undefined
						: readFileSync(path, 'utf8');
				} catch {
					return undefined;
				}
			},
			write: (text) => {
				if (path === undefined) return false;
				try {
					mkdirSync(dirname(path), { recursive: true });
					const scratch = `${path}.${String(process.pid)}.tmp`;
					writeFileSync(scratch, text);
					renameSync(scratch, path);
					return true;
				} catch {
					return false;
				}
			},
			now: () => new Date(),
		},
		reuseForbidden(process.argv, process.env),
	);
})();

/** What failed, said last: a caller keeps only the tail of the output. */
const failed: string[] = [];

/** What each step took, in the order it finished: the table printed last. */
const timings: { label: string; seconds: number; ok: boolean }[] = [];

/** Where the table of the last proofs is kept, one JSON line a proof. */
const TIMINGS_LOG = '.cache/delendai/results/logs/prove-timings.jsonl';

/** The step-timing table, slowest first, as plain lines. Pure. */
export const timingTableOf = (
	steps: readonly { label: string; seconds: number; ok: boolean }[],
): readonly string[] => [
	'prove: step timings (slowest first)',
	...[...steps]
		.sort((a, b) => b.seconds - a.seconds)
		.map(
			(each) =>
				`prove:   ${String(each.seconds).padStart(5)}s  ${each.ok ? 'ok  ' : 'FAIL'}  ${each.label}`,
		),
];

/** Print the table and keep it, so the next regression is visible. */
const saveTimings = (base: string, total: number, proved: boolean): void => {
	for (const line of timingTableOf(timings)) console.error(line);
	try {
		mkdirSync('.cache/delendai/results/logs', { recursive: true });
		appendFileSync(
			TIMINGS_LOG,
			`${JSON.stringify({ at: new Date().toISOString(), base: base.slice(0, 9), totalSeconds: total, proved, steps: timings })}\n`,
		);
	} catch {
		// the table was printed; a log that cannot be written proves nothing less
	}
};

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

/** Where each failed step's whole output is kept. */
const FAILED_OUTPUT_DIR = '.cache/delendai/results/logs/prove-failed';

/**
 * The file a failed step's whole output goes to: a caller keeps only the
 * tail of the proof, and the cause lines name a failing test without its
 * assertion, so a failure seen once could not be read again. Pure.
 */
export const failedOutputPathOf = (label: string): string =>
	`${FAILED_OUTPUT_DIR}/${label.replace(/[^\w.-]+/gu, '-')}.log`;

/** Keep a failed step's whole output, and name the file as a cause. */
const keepFailedOutput = (label: string, output: string): void => {
	const path = failedOutputPathOf(label);
	try {
		mkdirSync(FAILED_OUTPUT_DIR, { recursive: true });
		writeFileSync(path, output);
		causes.push(`(output) ${label}: the whole output is in ${path}`);
	} catch {
		// A log that cannot be written proves nothing less.
	}
};

/**
 * Run labelled bash scripts at once, at most `limit` together. Each is told
 * the changed files, so the lints that judge files one by one judge those.
 */
const runTogether = async (
	scripts: readonly (readonly [string, string])[],
	limit: number,
	changedFiles: readonly string[],
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
			const earlier = stepReuse.attempt(label, script, changedFiles);
			if (earlier !== undefined) {
				timings.push({ label, seconds: 0, ok: true });
				console.log(`prove: ${reusedLine(earlier)}`);
				continue;
			}
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
						env: {
							...process.env,
							VITEST_CHANGED_RUN: 'true',
							...(changedFiles.length > 0
								? {
										[CHANGED_FILES_ENV]:
											changedFiles.join('\n'),
									}
								: {}),
						},
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
			timings.push({
				label,
				seconds: Math.round((Date.now() - started) / 1000),
				ok: passed,
			});
			ok = passed && ok;
			if (passed) stepReuse.record(label, script, changedFiles);
			if (!passed) {
				failed.push(label);
				causes.push(...causeLinesOf(output));
				keepFailedOutput(label, output);
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
	selectionBase: string = base,
): Promise<boolean> => {
	// Deletions included, as plan-scope reads them: a deleted file can break
	// what a family reads, and it widens the per-file lints to the repository.
	const plan = planInputSince(base);
	const { changed } = plan;
	// The lints that judge files one by one judge what changed since the
	// selection base; which checks run, and the whole-repo ones, keep `base`.
	const lintChanged =
		selectionBase === base
			? changed
			: changedWithDeletionsSince(selectionBase);
	for (const line of familyPlanOf(plan)) console.log(line);
	// What the forge would run for this change: a check it skips proves
	// nothing here either.
	const checks = staticChecksOf(
		readFileSync('.github/workflows/ci.yml', 'utf8'),
		base,
		declaredBranches().integration,
	).filter(
		(check) =>
			jobMustRun({ ...plan, job: check.job }) &&
			(!isProposalOnly(changed) || PROPOSAL_CHECKS.has(check.job)),
	);
	const first = await runTogether(
		[
			...(jobMustRun({ ...plan, job: 'typecheck' })
				? proveGatesOf(base)
				: []
			).map((command) => ['typecheck', command.join(' ')] as const),
			...checks
				.filter((check) => !RUN_ALONE.has(check.job))
				.map((check) => [check.job, check.script] as const),
		],
		Number(process.env.PROVE_PARALLEL) || availableParallelism(),
		lintChanged,
	);
	const alone = await runTogether(
		checks
			.filter((check) => RUN_ALONE.has(check.job))
			.map((check) => [check.job, check.script] as const),
		1,
		lintChanged,
	);
	return first && alone;
};

const step = (label: string, command: readonly string[]): boolean => {
	const started = Date.now();
	const text = command.join(' ');
	const earlier = stepReuse.attempt(label, text, []);
	if (earlier !== undefined) {
		timings.push({ label, seconds: 0, ok: true });
		console.log(`prove: ${reusedLine(earlier)}`);
		return true;
	}
	const [bin = 'bun', ...rest] = command;
	const result = spawnSync(bin, rest, {
		stdio: ['ignore', 'pipe', 'pipe'],
		encoding: 'utf8',
		maxBuffer: Number.POSITIVE_INFINITY,
		env: { ...process.env, VITEST_CHANGED_RUN: 'true' },
	});
	process.stderr.write(result.stderr ?? '');
	const ok = result.status === 0;
	if (ok) stepReuse.record(label, text, []);
	timings.push({
		label,
		seconds: Math.round((Date.now() - started) / 1000),
		ok,
	});
	if (!ok) {
		failed.push(label);
		const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
		causes.push(...causeLinesOf(output));
		keepFailedOutput(label, output);
	}
	console.log(
		`prove: ${ok ? 'ok  ' : 'FAIL'} ${label} (${String(Math.round((Date.now() - started) / 1000))}s)`,
	);
	return ok;
};

/** A proposal file: prose the proposal gates read, that no code reads. */
const PROPOSAL_FILE = /^docs\/delendai\/proposals\//u;

/**
 * Whether the change is proposals and nothing else. Measured 2026-11-03: a
 * proposal-only change ran ten checks for 651 s, of which the proposal gates
 * and the generators that read proposals took under a minute. The tool
 * budgets, the preset and architecture lints, the token measurement and the
 * quality gate read code and the catalog's code inputs, which such a change
 * cannot move; the forge still runs every one of them.
 */
export const isProposalOnly = (changed: readonly string[]): boolean =>
	changed.length > 0 && changed.every((path) => PROPOSAL_FILE.test(path));

/** The static checks a proposal-only change can affect. */
export const PROPOSAL_CHECKS: ReadonlySet<string> = new Set([
	'lint-governance',
	'lint-docs',
	'lint-security',
]);

/** The generators that read proposals, each checked on its own (seconds). */
const PROPOSAL_GENERATORS: readonly (readonly [string, readonly string[]])[] = [
	[
		'agent-catalog current',
		[
			'bun',
			'tools/scripts/gen-all.script.ts',
			'--check',
			'--only',
			'agent-catalog',
		],
	],
	[
		'docs-index current',
		['bun', 'tools/scripts/docs/generate-docs-index.script.ts', '--check'],
	],
	[
		'host-hints current',
		[
			'bun',
			'tools/scripts/gen-all.script.ts',
			'--check',
			'--only',
			'host-hints',
		],
	],
	['roadmap drift', ['bun', 'tools/scripts/lint/roadmap-drift.script.ts']],
];

/** A file that can change what a tool tells the site. */
const TOOL_SOURCE = /^(plugins|packages)\/.*\.tool\.ts$/u;

/** The fast proof's test steps, for the paths a change touched. */
export const fastSteps = (
	changed: readonly string[],
	specs: readonly string[],
	base: string,
): readonly (readonly [string, readonly string[]])[] => {
	// vitest never runs the bun-owned specs: `bun test` runs those near the change.
	const { vitest, bun } = splitByRunner(specs);
	const bunSuite = bunSuiteCommand(changed, bun);
	return [
		...(vitest.length === 0
			? []
			: ([
					[
						'tests: the specs nearest the change',
						[
							// Not npx: it hands the command to `sh -c` as one string,
							// and a change that reaches every spec (the shared test
							// config) names more than the 128 KB one argument allows.
							'bunx',
							'vitest',
							'run',
							'--coverage',
							'--passWithNoTests',
							...vitest,
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
		// The machinery that builds, pushes and judges a batch is rehearsed on
		// one, so the layer that would fail land live fails here first.
		...(touchesIntegrationMachinery(changed)
			? ([
					[
						'land rehearsal',
						['bun', 'tools/scripts/forge/land-rehearsal.script.ts'],
					],
				] as const)
			: []),
		...(bunSuite === undefined
			? []
			: ([['test:sqlite', bunSuite]] as const)),
	];
};

/**
 * What fails in seconds runs first and ends the proof: a budget overshot by 27
 * bytes was reported after eleven minutes of checks that could not change it.
 */
export const earlySteps = (
	changed: readonly string[],
): readonly (readonly [string, readonly string[]])[] =>
	isProposalOnly(changed) ? PROPOSAL_GENERATORS : earlyStepsOfCode(changed);

const earlyStepsOfCode = (
	changed: readonly string[],
): readonly (readonly [string, readonly string[]])[] => [
	[
		'tool budgets',
		['bun', 'tools/scripts/test/run-actual-preset-budget.script.ts'],
	],
	// drift.yml, not ci.yml, holds this one: #1621 went red on a stale
	// AGENT.md after a proof that never looked.
	['generated files are current', ['bun', 'run', 'gen:all:check']],
	// The site's build, not its specs' zone, reads every tool's description:
	// #1633 went red on a translation older than the English it renders.
	...(changed.some((path) => TOOL_SOURCE.test(path))
		? ([
				[
					'site tool translations',
					['bun', 'apps/web/scripts/gen-capabilities.ts', '--strict'],
				],
			] as const)
		: []),
];

const main = async (): Promise<number> => {
	const base = execFileSync(
		'git',
		['merge-base', arg('base') ?? declaredIntegrationRef(), 'HEAD'],
		{ encoding: 'utf8' },
	).trim();
	const started = Date.now();
	// The last proof's output: a check of it fails a proof run twice.
	rmSync('build', { recursive: true, force: true });
	if (process.argv.includes('--fast')) {
		const root = process.cwd();
		// A proof that passed narrows what the next one selects by; the
		// whole-repo steps (early steps, typecheck) keep the merge base.
		const choice = chooseSelectionBase(
			base,
			readProofs(root),
			proofGitReader(root),
		);
		console.log(`prove: selecting by ${choice.message}`);
		const selectionBase = choice.base;
		const changed = changedSince(root, selectionBase);
		let early = true;
		for (const [label, command] of earlySteps(changedSince(root, base))) {
			early = step(label, command) && early;
		}
		if (!early) {
			saveTimings(base, Math.round((Date.now() - started) / 1000), false);
			printCauses();
			console.error(
				`prove: NOT PROVED, failed: ${failed.join(', ')}; (early) in ${String(Math.round((Date.now() - started) / 1000))}s`,
			);
			return 1;
		}
		let ok = await runChecks(base, selectionBase);
		// Coverage instruments only what the change touched, as the forge
		// does on a pull request (vitest.config.ts).
		process.env.VITEST_COVERAGE_FILES = changed.join('\n');
		for (const [label, command] of fastSteps(
			changed,
			nearSpecsSince(root, selectionBase),
			selectionBase,
		)) {
			ok = step(label, command) && ok;
		}
		saveTimings(base, Math.round((Date.now() - started) / 1000), ok);
		printCauses();
		if (ok) recordPassedProof(root, base, 'fast');
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
	let ok = await runChecks(base);
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
	saveTimings(base, Math.round((Date.now() - started) / 1000), ok);
	printCauses();
	if (ok) recordPassedProof(process.cwd(), base, 'full');
	console.log(
		`prove: ${ok ? 'PROVED' : 'NOT PROVED'} in ${String(Math.round((Date.now() - started) / 1000))}s against ${base.slice(0, 9)}`,
	);
	return ok ? 0 : 1;
};

if (import.meta.main) process.exit(await main());
