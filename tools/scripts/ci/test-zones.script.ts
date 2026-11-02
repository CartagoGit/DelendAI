#!/usr/bin/env bun

/**
 * test-zones — group the suite into named areas, and split only the
 * areas that are too big for one job.
 *
 * WHY: `test-shard 4/8` failing tells a reader nothing. It is a quarter
 * of an alphabetised file list, so the same shard number means a
 * different set of specs on every commit, and finding out what broke
 * means opening the log. `tests: proposals` failing points at a place.
 *
 * The grouping is by PATH RULE, not by a list of workspaces. A list in
 * a workflow file is a second source of truth for the repository layout:
 * it is correct on the day it is written, and a plugin added six months
 * later silently belongs to no job. Here the last rule is a catch-all,
 * so a spec that matches nothing still runs — "nowhere" is the one
 * outcome a test split must never produce.
 *
 * Zones that hold more specs than one job should carry are split into
 * `zone i/n`, from the measured count rather than a number somebody
 * picked. Wall clock is the slowest job, so the only figure that
 * matters is the biggest zone.
 */

import { execFileSync } from 'node:child_process';
import { gitVerbatim, readGit } from '@delendai/core/runtime';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { repoRoot } from '../lib/repo-root';

import { buildGraph, computeAffected, gitDiffChanges } from './affected.script';
import { pathImportersOf } from './path-importers';
import { balanceByTime } from './spec-timings';
import {
	TARGET_SPECS_PER_JOB,
	TEST_WORKFLOW,
	ZONE_READ_MAP_PATH,
	ZONE_RULES,
} from './test-zones.constant';
import type {
	IRootChange,
	IZoneJob,
	IZoneReach,
	IZoneReadMap,
	IZoneRule,
} from './test-zones.interface';
import {
	onlyScriptsChanged,
	parseZoneReadMap,
	readersOf,
	isWorkflowFile,
	ROOT_MANIFEST,
	runsEverything,
	testRunnerChanged,
	zonesReadingRootFiles,
} from './zone-reads';

export { TARGET_SPECS_PER_JOB, ZONE_RULES } from './test-zones.constant';
export type { IZoneJob, IZoneRule } from './test-zones.interface';

/** The zone a spec belongs to. First matching rule wins. */
export const zoneOf = (
	specPath: string,
	rules: readonly IZoneRule[] = ZONE_RULES,
): string => rules.find((rule) => rule.match(specPath))?.id ?? 'tools';

/**
 * Turn measured spec counts into the jobs CI should run.
 *
 * Pure, so the split can be pinned by cases instead of inferred from a
 * workflow run. A zone with no specs still produces one job: a zone
 * that vanishes from the checks list because it happened to be empty
 * is indistinguishable from a zone that was forgotten.
 */
export const planZones = (input: {
	readonly specs: readonly string[];
	readonly workspaceDirs: readonly string[];
	readonly target?: number;
	readonly rules?: readonly IZoneRule[];
	/** Each spec's measured duration; with it, a split zone is split by time. */
	readonly timings?: Readonly<Record<string, number>>;
}): readonly IZoneJob[] => {
	const rules = input.rules ?? ZONE_RULES;
	const target = input.target ?? TARGET_SPECS_PER_JOB;
	const counts = new Map<string, number>(rules.map((rule) => [rule.id, 0]));
	for (const spec of input.specs) {
		const id = zoneOf(spec, rules);
		counts.set(id, (counts.get(id) ?? 0) + 1);
	}

	const jobs: IZoneJob[] = [];
	for (const rule of rules) {
		const specs = counts.get(rule.id) ?? 0;
		// ROUND, not ceil. With ceil a zone one spec over the target
		// splits into two half-empty jobs: 201 specs would become two
		// jobs of ~100, paying a second runner's five minutes of module
		// loading to save nothing. Rounding tolerates a zone up to half
		// a job over target, which costs a little on the slowest zone
		// and saves a whole job everywhere else.
		// Cost, not count. A zone whose specs spawn processes or walk the
		// repository costs several times what the module-loading model
		// assumes, and splitting it by count hands it one job while it
		// needs three — which is how one zone came to set the critical
		// path of every pull request.
		const weighted = specs * (rule.costWeight ?? 1);
		const shards = Math.max(1, Math.round(weighted / target));
		const paths = rule.paths(input.workspaceDirs);
		// By time when there are timings to split by: `--shard` splits by
		// count, and one full run's shards took between 75 s and 244 s.
		const byTime =
			shards > 1 && Object.keys(input.timings ?? {}).length > 0
				? balanceByTime(
						input.specs.filter(
							(spec) => zoneOf(spec, rules) === rule.id,
						),
						shards,
						input.timings ?? {},
					)
				: undefined;
		for (let shard = 1; shard <= shards; shard += 1) {
			const files = byTime?.[shard - 1];
			jobs.push({
				name: shards === 1 ? rule.id : `${rule.id} ${shard}/${shards}`,
				zone: rule.id,
				paths,
				shard,
				shards,
				specs,
				...(files === undefined ? {} : { files }),
			});
		}
	}
	return jobs;
};

const tracked = (): readonly string[] =>
	execFileSync('git', ['ls-files'], {
		cwd: repoRoot(),
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024,
	})
		.split('\n')
		.filter((line) => line.length > 0);

/** Workspace directories, read from what is on disk rather than listed. */
const workspaceDirs = (files: readonly string[]): readonly string[] => [
	...new Set(
		files
			.filter((file) => file.endsWith('/package.json'))
			.map((file) => file.slice(0, -'/package.json'.length))
			.filter((dir) => dir.split('/').length === 2),
	),
];

const arg = (name: string): string | undefined => {
	const hit = process.argv.find((each) => each.startsWith(`--${name}=`));
	return hit?.slice(name.length + 3);
};

/**
 * Which zones to run for `base`, or `undefined` for all of them.
 *
 * Only a pull request has a base to filter against. A dispatched run and
 * a push arrive with none — the workflow passes an empty `--base=` — and
 * an empty base used to be taken as a real one: the diff against it was
 * empty, every zone reported `skipped`, and the run went green having
 * tested nothing. That run is the integration branch's full validation,
 * so no base means the full matrix.
 */
export const reachForBase = (
	base: string | undefined,
	reach: (base: string) => ReadonlySet<string> | undefined,
): ReadonlySet<string> | undefined =>
	base === undefined || base.trim() === '' ? undefined : reach(base);

/**
 * Which zones a change can actually reach, through the workspace
 * dependency graph rather than by guessing from paths.
 *
 * Returns `undefined` — meaning RUN EVERYTHING — whenever the answer
 * cannot be trusted: a file changed outside every workspace (a root
 * config, a workflow, the lockfile) can affect anything, and so can a
 * graph this fails to build. Fail open on the question "might this be
 * affected", because the cost of being wrong is a false green.
 */
export const zoneReach = (
	input: {
		readonly base: string;
		/** The end of the change; `HEAD` when omitted. */
		readonly head?: string;
		readonly rootDir: string;
		readonly rules?: readonly IZoneRule[];
	},
	deps: {
		readonly buildGraph: typeof buildGraph;
		readonly computeAffected: typeof computeAffected;
		readonly diff: typeof gitDiffChanges;
		/** The observed read map; `undefined` means none is available. */
		readonly readMap?: () => IZoneReadMap | undefined;
		/**
		 * Told why, whenever the answer is "every zone". Falling back is
		 * safe; falling back without saying so is how every pull request
		 * ran all eleven zones for as long as the planner's checkout could
		 * not see the base.
		 */
		readonly explain?: (reason: string) => void;
		/**
		 * A file's content where the change left its base and at its end;
		 * `undefined` when absent there. Read only for the test workflow.
		 */
		readonly contentAt?: (
			side: 'base' | 'head',
			path: string,
		) => string | undefined;
		/**
		 * Tracked files that import one of these changed paths by a
		 * relative path, across workspaces included.
		 */
		readonly importersOf?: (paths: readonly string[]) => readonly string[];
	} = {
		buildGraph,
		computeAffected,
		diff: gitDiffChanges,
		readMap: () => committedReadMap(input.rootDir),
	},
): IZoneReach | undefined => {
	const everyZone = (reason: string): undefined => {
		deps.explain?.(reason);
		return undefined;
	};
	let affected: ReturnType<typeof computeAffected>;
	let graph: ReturnType<typeof buildGraph>;
	let changes: ReturnType<typeof gitDiffChanges>;
	try {
		graph = deps.buildGraph(input.rootDir);
	} catch (error) {
		return everyZone(
			`the workspace graph could not be built (${messageOf(error)})`,
		);
	}
	try {
		changes = deps.diff(input.base, input.head ?? 'HEAD', input.rootDir);
	} catch (error) {
		return everyZone(
			`the change could not be diffed against ${input.base} — is the base in the clone? (${messageOf(error)})`,
		);
	}
	try {
		affected = deps.computeAffected(
			changes.map((change) => change.path),
			graph,
		);
	} catch (error) {
		return everyZone(
			`what the change affects could not be computed (${messageOf(error)})`,
		);
	}
	const rules = input.rules ?? ZONE_RULES;
	// A change outside every workspace reaches only the zones observed to
	// read it. It used to reach everything, so a pull request that
	// edited one proposal ran all eleven shards. Without a usable map, or
	// for a root-level configuration file, it still runs everything.
	const roots = new Set(affected.rootFiles);
	const readMap = roots.size === 0 ? undefined : deps.readMap?.();
	const rootChanges = changes
		.filter((change) => roots.has(change.path))
		.map(
			(change): IRootChange =>
				change.path === ROOT_MANIFEST
					? {
							...change,
							scriptsOnly:
								deps.contentAt === undefined
									? undefined
									: onlyScriptsChanged(
											deps.contentAt('base', change.path),
											deps.contentAt('head', change.path),
										),
						}
					: !isWorkflowFile(change.path)
						? change
						: {
								...change,
								// Only the test workflow runs the zones; another workflow's
								// edit reaches the zones that read it, like any root file.
								runnerChanged:
									change.path !== TEST_WORKFLOW
										? false
										: deps.contentAt === undefined
											? undefined
											: testRunnerChanged(
													deps.contentAt(
														'base',
														change.path,
													),
													deps.contentAt(
														'head',
														change.path,
													),
												),
							},
		);
	const rootReached =
		roots.size === 0
			? new Set<string>()
			: zonesReadingRootFiles(
					rootChanges,
					readMap,
					ownPathsOf(rules, [...graph.dirToName.keys()]),
				);
	if (rootReached === undefined) {
		return everyZone(
			readMap === undefined
				? 'no zone read map says which zones read the changed files outside every workspace'
				: `a root file or a workflow can reach any zone (${rootChanges
						.filter(runsEverything)
						.map((change) => change.path)
						.join(', ')})`,
		);
	}

	// DOWNSTREAM plus what changed directly — never upstream. `affected`
	// unions both because it answers a build-ordering question: to build
	// X you first build what X depends on. Test selection asks the
	// opposite question, "what could this change have broken", and the
	// answer never points at a dependency. Using `affected` here marked
	// 51 workspaces reachable from a four-file change to a CI script
	// that nothing depends on, which is the same as running everything.
	const reached = new Set<string>([
		...affected.directByWorkspace.keys(),
		...affected.downstream,
	]);
	const dirs = [...graph.dirToName.entries()]
		.filter(([, name]) => reached.has(name))
		.map(([dir]) => dir);

	// The zones the change reaches by its code; the rest it reaches only
	// because their specs read a file it changed.
	const zones = new Set<string>();
	for (const dir of dirs) {
		const id = zoneOf(`${dir}/x.spec.ts`, rules);
		if (id !== undefined) zones.add(id);
	}
	// A zone whose specs read other workspaces' sources from disk is
	// reached by a change to them, which the module graph cannot see.
	for (const rule of rules) {
		if (
			rule.scans !== undefined &&
			changes.some((change) => rule.scans?.(change.path) === true)
		) {
			zones.add(rule.id);
		}
	}
	// A file that imports a changed one by its path is reached by the
	// change wherever it lives: the workspace graph follows package names
	// and does not see it.
	for (const importer of deps.importersOf?.(
		changes.map((change) => change.path),
	) ?? []) {
		zones.add(zoneOf(importer, rules));
	}
	const readOnly = new Set(
		[...rootReached].filter((zone) => !zones.has(zone)),
	);
	for (const zone of rootReached) zones.add(zone);
	const known = readersOf(rootChanges, readMap);
	// Every zone the root change reaches, the code-reached ones included:
	// `--changed` follows imports and misses their specs that READ the
	// file, so those specs run beside it, in the shared readers job.
	const readers = new Map(
		[...rootReached].flatMap((zone) => {
			const specs = known.get(zone);
			return specs === undefined ? [] : [[zone, specs] as const];
		}),
	);
	return { zones, readOnly, readers, rootReached };
};

/**
 * The jobs to start: the ones that run, with every `readers` job merged
 * into one (a few specs each, and every job costs a runner and its setup).
 * A matrix cannot be empty, so a change that runs nothing gets one job
 * that says so.
 */
export const compactMatrix = <
	T extends {
		readonly name: string;
		readonly paths: string;
		readonly shard: string;
		readonly run: boolean;
		readonly filter: string;
		readonly readers: string;
	},
>(
	entries: readonly T[],
): readonly {
	readonly name: string;
	readonly paths: string;
	readonly shard: string;
	readonly run: boolean;
	readonly filter: string;
	readonly readers: string;
}[] => {
	const running = entries.filter(
		(entry) => entry.run && entry.filter !== 'readers',
	);
	const readers = [
		...new Set(
			entries
				.filter((entry) => entry.run && entry.filter === 'readers')
				.flatMap((entry) =>
					entry.readers.split(/\s+/u).filter(Boolean),
				),
		),
	].sort();
	const merged =
		readers.length === 0
			? []
			: [
					{
						name: 'readers',
						paths: '',
						shard: '1/1',
						run: true,
						filter: 'readers',
						readers: readers.join(' '),
					},
				];
	const all = [...running, ...merged];
	return all.length > 0
		? all
		: [
				{
					name: 'none',
					paths: '',
					shard: '1/1',
					run: false,
					filter: 'none',
					readers: '',
				},
			];
};

/** The zones a change reaches; `undefined` means every zone. */
export const reachableZones = (
	...args: Parameters<typeof zoneReach>
): ReadonlySet<string> | undefined => zoneReach(...args)?.zones;

const messageOf = (error: unknown): string =>
	(error instanceof Error ? error.message : String(error))
		.split('\n')[0]
		?.trim() ?? '';

/** The paths each zone's own specs live under, per rule. */
const ownPathsOf = (
	rules: readonly IZoneRule[],
	workspaceDirs: readonly string[],
): Readonly<Record<string, readonly string[]>> =>
	Object.fromEntries(
		rules.map((rule) => [rule.id, rule.paths(workspaceDirs)]),
	);

/** Where `head` left `base`, or the base itself when git cannot say. */
const mergeBaseOf = (base: string, rootDir: string): string => {
	return readGit(rootDir, ['merge-base', base, 'HEAD']) ?? base;
};

/** A file's content at a revision, or `undefined` when it is not there. */
const contentAt = (
	revision: string,
	path: string,
	rootDir: string,
): string | undefined => {
	return gitVerbatim(rootDir, ['show', `${revision}:${path}`]);
};

const committedReadMap = (rootDir: string): IZoneReadMap | undefined => {
	try {
		return parseZoneReadMap(
			readFileSync(join(rootDir, ZONE_READ_MAP_PATH), 'utf8'),
		);
	} catch {
		return undefined;
	}
};

/**
 * The most the matrix may weigh. Its jobs read it in an environment
 * variable, and Linux refuses one over 128 KiB: the spec lists went in the
 * matrix once, `delendai-validate` could not start, and develop was red
 * with no failing check. The lists travel in an artifact (`--files-out`).
 */
const MAX_MATRIX_BYTES = 64 * 1024;

/** Each time-split job's spec list, by job name, as `--files-out` writes it. */
export const shardFilesOf = (
	jobs: readonly {
		readonly name: string;
		readonly files?: readonly string[];
	}[],
): string =>
	`${JSON.stringify(
		Object.fromEntries(
			jobs.flatMap((job) =>
				job.files === undefined
					? []
					: [[job.name, job.files.join(' ')]],
			),
		),
	)}\n`;

const withTimings = (
	timings: Readonly<Record<string, number>> | undefined,
): { readonly timings?: Readonly<Record<string, number>> } =>
	timings === undefined ? {} : { timings };

/** The timings at `path`, or none: without them the split is by count. */
const readTimings = (
	path: string | undefined,
): Readonly<Record<string, number>> | undefined => {
	if (path === undefined) return undefined;
	try {
		const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
		return typeof parsed === 'object' && parsed !== null
			? (parsed as Record<string, number>)
			: undefined;
	} catch {
		// Absent or unreadable timings split by count, as before them.
		return undefined;
	}
};

const main = (): number => {
	const files = tracked();
	const jobs = planZones({
		specs: files.filter((file) => file.endsWith('.spec.ts')),
		workspaceDirs: workspaceDirs(files),
		...withTimings(readTimings(arg('timings'))),
	});

	const wanted = arg('paths');
	if (wanted !== undefined) {
		const job = jobs.find((each) => each.name === wanted);
		if (job === undefined) {
			console.error(
				`test-zones: no job named "${wanted}". Known: ${jobs.map((each) => each.name).join(', ')}`,
			);
			return 1;
		}
		console.log(job.paths.join(' '));
		return 0;
	}

	const rootDir = repoRoot();
	let everyZoneBecause =
		'no base: a push or a dispatch validates the whole tree';
	const base = arg('base');
	const full =
		base === undefined || base.trim() === ''
			? undefined
			: zoneReach(
					{ base, rootDir },
					{
						buildGraph,
						computeAffected,
						diff: gitDiffChanges,
						readMap: () => committedReadMap(rootDir),
						importersOf: (paths) => pathImportersOf(rootDir, paths),
						contentAt: (side, path) =>
							contentAt(
								side === 'base'
									? mergeBaseOf(base, rootDir)
									: 'HEAD',
								path,
								rootDir,
							),
						explain: (reason) => {
							everyZoneBecause = reason;
						},
					},
				);
	const reach = full?.zones;
	/**
	 * What a job runs: `changed` (the specs its imports reach), `readers`
	 * (the listed specs that read a changed file, on its first shard only),
	 * `all` (the zone unfiltered: reached by a read nobody can attribute),
	 * or `none`.
	 */
	const planFor = (
		job: (typeof jobs)[number],
	): { readonly filter: string; readonly readers: readonly string[] } => {
		if (full === undefined) return { filter: 'all', readers: [] };
		if (!full.zones.has(job.zone)) return { filter: 'none', readers: [] };
		if (!full.readOnly.has(job.zone))
			// A root change it reads, with no record of which specs read
			// it: `--changed` alone would miss them.
			return full.rootReached?.has(job.zone) === true &&
				full.readers?.get(job.zone) === undefined
				? { filter: 'all', readers: [] }
				: { filter: 'changed', readers: [] };
		const readers = full.readers?.get(job.zone);
		if (readers === undefined) return { filter: 'all', readers: [] };
		return readers.length === 0 || job.shard !== 1
			? { filter: 'none', readers: [] }
			: { filter: 'readers', readers };
	};

	/** The readers of a root change in zones that also run `--changed`. */
	const codeReachedReaders = (): readonly (readonly [
		string,
		readonly string[],
	])[] =>
		[...(full?.readers ?? new Map<string, readonly string[]>())].filter(
			([zone, specs]) =>
				specs.length > 0 &&
				full?.readOnly.has(zone) === false &&
				jobs.some(
					(job) =>
						job.zone === zone && planFor(job).filter === 'changed',
				),
		);

	if (process.argv.includes('--matrix')) {
		// stdout is the matrix the workflow reads; the reason goes to the log.
		if (reach === undefined) {
			console.error(`test-zones: every zone runs — ${everyZoneBecause}`);
		}
		const entries = [
			...jobs.map((job) => ({
				name: job.name,
				paths: job.paths.join(' '),
				shard: `${job.shard}/${job.shards}`,
				listed: job.files !== undefined,
				run: planFor(job).filter !== 'none',
				filter: planFor(job).filter,
				readers: planFor(job).readers.join(' '),
			})),
			...codeReachedReaders().map(([zone, specs]) => ({
				name: `${zone} readers`,
				paths: '',
				shard: '1/1',
				listed: false,
				run: true,
				filter: 'readers',
				readers: specs.join(' '),
			})),
		];
		// What does not run is stated here, on the log, and does not start
		// a job: each one took a runner and its setup to report `skipped`.
		for (const entry of entries.filter((each) => !each.run)) {
			console.error(
				`test-zones: ${entry.name} — not started, the change reaches none of its specs`,
			);
		}
		const matrix = JSON.stringify(compactMatrix(entries));
		if (Buffer.byteLength(matrix) > MAX_MATRIX_BYTES) {
			console.error(
				`test-zones: the matrix is ${String(Buffer.byteLength(matrix))} bytes, over the ${String(MAX_MATRIX_BYTES)} a job can take in one variable.`,
			);
			return 1;
		}
		const filesOut = arg('files-out');
		if (filesOut !== undefined) {
			writeFileSync(filesOut, shardFilesOf(jobs));
		}
		console.log(matrix);
		return 0;
	}

	// Which zones the change reaches, stated, so a wrong selection is
	// visible in the log rather than silent.
	if (reach === undefined) {
		console.log(`test-zones: every zone runs — ${everyZoneBecause}`);
	}
	for (const job of jobs) {
		const plan = planFor(job);
		const verdict =
			reach === undefined
				? 'runs (every zone, see above)'
				: plan.filter === 'changed'
					? 'runs the specs its imports reach'
					: plan.filter === 'readers'
						? `runs the ${String(plan.readers.length)} spec(s) that read the change: ${plan.readers.join(', ')}`
						: plan.filter === 'all'
							? 'runs unfiltered (reached by a read the map cannot attribute to a spec)'
							: reach.has(job.zone)
								? 'skipped (no spec of this shard reads the change)'
								: 'skipped (the change reaches none of its specs or reads)';
		console.log(
			`${job.name.padEnd(16)} ${String(job.specs).padStart(5)} spec(s) in the zone, ${job.shards} job(s) — ${verdict}`,
		);
	}
	return 0;
};

if (import.meta.main) process.exit(main());
