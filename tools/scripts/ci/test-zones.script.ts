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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { repoRoot } from '../lib/repo-root';

import { buildGraph, computeAffected, gitDiffNames } from './affected.script';
import {
	TARGET_SPECS_PER_JOB,
	ZONE_READ_MAP_PATH,
	ZONE_RULES,
} from './test-zones.constant';
import type { IZoneJob, IZoneReadMap, IZoneRule } from './test-zones.interface';
import { parseZoneReadMap, zonesReadingRootFiles } from './zone-reads';

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
		for (let shard = 1; shard <= shards; shard += 1) {
			jobs.push({
				name: shards === 1 ? rule.id : `${rule.id} ${shard}/${shards}`,
				zone: rule.id,
				paths,
				shard,
				shards,
				specs,
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
export const reachableZones = (
	input: {
		readonly base: string;
		readonly rootDir: string;
		readonly rules?: readonly IZoneRule[];
	},
	deps: {
		readonly buildGraph: typeof buildGraph;
		readonly computeAffected: typeof computeAffected;
		readonly diff: typeof gitDiffNames;
		/** The observed read map; `undefined` means none is available. */
		readonly readMap?: () => IZoneReadMap | undefined;
	} = {
		buildGraph,
		computeAffected,
		diff: gitDiffNames,
		readMap: () => committedReadMap(input.rootDir),
	},
): ReadonlySet<string> | undefined => {
	let affected: ReturnType<typeof computeAffected>;
	let graph: ReturnType<typeof buildGraph>;
	try {
		graph = deps.buildGraph(input.rootDir);
		affected = deps.computeAffected(deps.diff(input.base, 'HEAD'), graph);
	} catch {
		return undefined;
	}
	// A change outside every workspace reaches only the zones observed to
	// read it. It used to reach everything, so a pull request that
	// edited one proposal ran all eleven shards. Without a usable map, or
	// for a root-level configuration file, it still runs everything.
	const rootReached =
		affected.rootFiles.length === 0
			? new Set<string>()
			: zonesReadingRootFiles(affected.rootFiles, deps.readMap?.());
	if (rootReached === undefined) return undefined;

	const rules = input.rules ?? ZONE_RULES;
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

	const zones = new Set<string>();
	for (const dir of dirs) {
		const id = zoneOf(`${dir}/x.spec.ts`, rules);
		if (id !== undefined) zones.add(id);
	}
	for (const zone of rootReached) zones.add(zone);
	return zones;
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

const main = (): number => {
	const files = tracked();
	const jobs = planZones({
		specs: files.filter((file) => file.endsWith('.spec.ts')),
		workspaceDirs: workspaceDirs(files),
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

	const reach = reachForBase(arg('base'), (base) =>
		reachableZones({ base, rootDir: repoRoot() }),
	);

	if (process.argv.includes('--matrix')) {
		console.log(
			JSON.stringify(
				jobs.map((job) => ({
					name: job.name,
					paths: job.paths.join(' '),
					shard: `${job.shard}/${job.shards}`,
					// The zone STAYS in the matrix even when the change
					// cannot reach it, and reports `skipped` instead of
					// vanishing: a zone missing from the checks list
					// because it was unaffected is indistinguishable
					// from one that was forgotten. `undefined` reach
					// means run everything.
					run: reach === undefined || reach.has(job.zone),
				})),
			),
		);
		return 0;
	}

	for (const job of jobs) {
		console.log(
			`${job.name.padEnd(16)} ${String(job.specs).padStart(5)} spec(s) in the zone, ${job.shards} job(s)`,
		);
	}
	return 0;
};

if (import.meta.main) process.exit(main());
