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

import { repoRoot } from '../lib/repo-root';

import { TARGET_SPECS_PER_JOB, ZONE_RULES } from './test-zones.constant';
import type { IZoneJob, IZoneRule } from './test-zones.interface';

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
		const shards = Math.max(1, Math.round(specs / target));
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

	if (process.argv.includes('--matrix')) {
		console.log(
			JSON.stringify(
				jobs.map((job) => ({
					name: job.name,
					paths: job.paths.join(' '),
					shard: `${job.shard}/${job.shards}`,
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
