#!/usr/bin/env bun

/**
 * job-scope — decide which CI jobs a change can possibly affect.
 *
 * WHY: `develop` is green by construction — nothing reaches it except
 * through a pull request that passed. So a job whose inputs this change
 * did not touch already has a verdict, and re-running it re-establishes
 * something nobody doubted. That is most of what a pull request waits
 * for, and all of what a pull request that only FIXES a previous
 * failure waits for.
 *
 * WHAT MAKES IT SAFE: the default is to run. A job with no declaration
 * runs; a change that touches something unrecognised runs everything;
 * and `lint:job-scope` fails when a workflow job has no entry, so the
 * cost of forgetting is a slower pull request rather than an unchecked
 * one. Every bound in `job-scope.constant.ts` carries the reason it is
 * correct, because a bound without one is a guess that looks like a
 * decision.
 *
 * WHAT IT IS NOT: a way to skip a required check. A job skipped here is
 * reported to `delendai-validate` as deliberately not applicable, with
 * the scope decision alongside it, and the aggregate still refuses any
 * job that is merely absent.
 */

import { execFileSync } from 'node:child_process';
import { posix } from 'node:path';

import { repoRoot } from '../lib/repo-root';

import { exportDelta } from './export-delta';

import { TEST_WORKFLOW } from './test-zones.constant';
import { changedWorkflowJobs } from './zone-reads';

import { jobsReachedSince, structuralSince } from './job-reach.helper';
import { JOB_SCOPES } from './job-scope.constant';
import type { IJobScope } from './job-scope.interface';

export { JOB_SCOPES } from './job-scope.constant';
export type { IJobScope } from './job-scope.interface';

/** Markdown under docs/ or at the repository root: prose, not code. */
export const isProse = (file: string): boolean =>
	file.endsWith('.md') && (file.startsWith('docs/') || !file.includes('/'));

/**
 * Whether one job has to run for this set of changed files.
 *
 * An unknown job runs. That is the whole safety property: the answer to
 * "I have never heard of this job" is never "skip it".
 */
export const jobMustRun = (
	input: IPlanInput & { readonly job: string },
): boolean => decide(input, input.job).runs;

/** What a plan is decided from. */
export interface IPlanInput {
	readonly changed: readonly string[];
	readonly scopes?: readonly IJobScope[];
	/**
	 * The paths the change adds or removes. Absent, every changed path
	 * counts as one: the cautious reading.
	 */
	readonly structural?: readonly string[] | undefined;
	/**
	 * The jobs whose own scripts the change reaches by symbol. Absent, a
	 * job that declares `code: 'scripts'` counts as reached by any change.
	 */
	readonly reached?: ReadonlySet<string> | undefined;
	/**
	 * The jobs whose block in the test workflow the change edited. Present,
	 * an edit of the workflow runs those jobs and reaches no other: the
	 * definition is proved by running it, with the selection the rest of
	 * the change makes. Absent, the workflow counts as a file every job
	 * that reads `.github/` reads.
	 */
	readonly workflowJobs?: ReadonlySet<string> | undefined;
	/**
	 * The changed entry files whose exported names moved. Absent, every
	 * changed entry counts as moved: the cautious reading.
	 */
	readonly surfaceMoved?: ReadonlySet<string> | undefined;
}

const under = (file: string, prefixes: readonly string[]): boolean =>
	prefixes.some((prefix) => file.startsWith(prefix));

/**
 * The decision for one job and the sentence that says why. One function, so
 * the log line is the decision and not a second opinion beside it.
 */
const decide = (
	input: IPlanInput,
	job: string,
): { readonly runs: boolean; readonly why: string } => {
	const scope = (input.scopes ?? JOB_SCOPES).find((each) => each.job === job);
	if (scope === undefined)
		return { runs: true, why: 'undeclared: an unknown job always runs' };
	const members = scope.group;
	if (members !== undefined) {
		const decisions = members.map((member) => ({
			member,
			...decide(input, member),
		}));
		const running = decisions.find((each) => each.runs);
		return running === undefined
			? { runs: false, why: 'none of its checks can be affected' }
			: { runs: true, why: `${running.member}: ${running.why}` };
	}
	// A change with no files is not evidence that nothing is affected —
	// it is evidence that the diff could not be read.
	if (input.changed.length === 0)
		return {
			runs: true,
			why: 'no change list (a push, a dispatch or an unreadable diff): nothing is skipped',
		};
	if (input.workflowJobs?.has(job) === true)
		return {
			runs: true,
			why: `its block in ${TEST_WORKFLOW} changed`,
		};
	const changed =
		input.workflowJobs === undefined
			? input.changed
			: input.changed.filter((file) => file !== TEST_WORKFLOW);
	if (changed.length === 0 && scope.touches !== 'always')
		return {
			runs: false,
			why: `only ${TEST_WORKFLOW} changed, and not this job's block`,
		};
	return decideFor(
		{ ...input, changed: changed.length === 0 ? input.changed : changed },
		scope,
	);
};

/** The decision for a declared job over the changed files that count. */
const decideFor = (
	input: IPlanInput,
	scope: IJobScope,
): { readonly runs: boolean; readonly why: string } => {
	const { job } = scope;
	const isEntry = (file: string): boolean =>
		scope.surface?.test(file) === true;
	// A published entry file counts only when the names it exports moved.
	const moved = input.changed.find(
		(file) =>
			isEntry(file) &&
			(input.surfaceMoved === undefined || input.surfaceMoved.has(file)),
	);
	if (moved !== undefined)
		return { runs: true, why: `${moved} changed the names it exports` };
	const changed =
		scope.surface === undefined
			? input.changed
			: input.changed.filter((file) => !isEntry(file));
	if (scope.docs === 'skip' && changed.every(isProse))
		return {
			runs: false,
			why: 'the change is prose only, which this job does not read',
		};
	if (scope.touches === 'always')
		return {
			runs: true,
			why: 'declared always: its verdict depends on the whole repository',
		};
	const read =
		scope.matches !== undefined
			? changed.find((file) => scope.matches?.test(file) === true)
			: changed.find((file) =>
					under(file, scope.touches as readonly string[]),
				);
	if (read !== undefined) return { runs: true, why: `${read} changed` };
	const listed = (input.structural ?? input.changed).find(
		(file) => scope.lists !== undefined && under(file, scope.lists),
	);
	if (listed !== undefined)
		return {
			runs: true,
			why: `${listed} was added or removed where it lists files`,
		};
	if (scope.code === 'scripts') {
		if (input.reached === undefined)
			return {
				runs: true,
				why: 'no symbol analysis: its scripts count as reached',
			};
		if (input.reached.has(job))
			return {
				runs: true,
				why: 'the change reaches its scripts by symbol',
			};
	}
	if (scope.matches !== undefined)
		return {
			runs: false,
			why: `no changed file matches ${String(scope.matches)}`,
		};
	return {
		runs: false,
		why: `no changed file is under what it reads (${scope.touches.join(', ')})${scope.code === 'scripts' ? ', and the change reaches none of its scripts' : ''}${scope.surface === undefined ? '' : ', and no entry file moved the names it exports'}`,
	};
};

/** The run/skip decision for every declared job. */
export const planJobs = (
	input: IPlanInput,
): Readonly<Record<string, boolean>> =>
	Object.fromEntries(
		(input.scopes ?? JOB_SCOPES).map((scope) => [
			scope.job,
			decide(input, scope.job).runs,
		]),
	);

/**
 * Why each job runs or does not, in a sentence a reader of the log can
 * check against the change: a wrong bound is then seen, not inferred
 * from a job that silently did not appear.
 */
export const explainJobs = (
	input: IPlanInput,
): readonly {
	readonly job: string;
	readonly runs: boolean;
	readonly why: string;
}[] =>
	(input.scopes ?? JOB_SCOPES).map((scope) => ({
		job: scope.job,
		...decide(input, scope.job),
	}));

/**
 * The change list a lint job is given, as one JSON output. Past this many
 * bytes it is left empty, which every lint reads as "judge the repository":
 * a job output has a size limit, and a list cut short would narrow a lint to
 * files the change did not stop at.
 */
export const CHANGED_OUTPUT_MAX_BYTES = 256 * 1024;

/** The `changed=` output line's value. Pure. */
export const changedOutputOf = (changed: readonly string[]): string => {
	const json = JSON.stringify(changed);
	return json.length > CHANGED_OUTPUT_MAX_BYTES ? '' : json;
};

/** Every path changed since `base`, deletions included; [] when unreadable. */
export const changedSince = (base: string): readonly string[] => {
	try {
		return execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], {
			cwd: repoRoot(),
			encoding: 'utf8',
			maxBuffer: 64 * 1024 * 1024,
		})
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line.length > 0);
	} catch {
		// An unreadable diff must widen the run, never narrow it.
		return [];
	}
};

/** Where the change left `base`: what its diff is taken from. */
const mergeBaseOf = (root: string, base: string): string => {
	try {
		return execFileSync('git', ['merge-base', base, 'HEAD'], {
			cwd: root,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
		}).trim();
	} catch {
		return base;
	}
};

/** A file's content at a commit; `undefined` when absent or unreadable. */
const showAt = (
	root: string,
	ref: string,
	path: string,
): string | undefined => {
	try {
		return execFileSync('git', ['show', `${ref}:${path}`], {
			cwd: root,
			encoding: 'utf8',
			maxBuffer: 64 * 1024 * 1024,
			stdio: ['ignore', 'pipe', 'ignore'],
		});
	} catch {
		return undefined;
	}
};

const arg = (name: string): string | undefined => {
	const hit = process.argv.find((each) => each.startsWith(`--${name}=`));
	return hit?.slice(name.length + 3);
};

/** A module specifier as the path it names, enough to tell two versions apart. */
const specifierPath = (file: string, specifier: string): string | undefined =>
	specifier.startsWith('.')
		? posix.normalize(posix.join(posix.dirname(file), specifier))
		: undefined;

/**
 * The changed entry files whose exported names moved. An entry added or
 * removed, one that declares something itself, or one whose delta cannot be
 * bounded counts as moved.
 */
export const surfaceMovedSince = (
	root: string,
	base: string,
	changed: readonly string[],
): ReadonlySet<string> => {
	const entries = JOB_SCOPES.flatMap((scope) =>
		scope.surface === undefined ? [] : [scope.surface],
	);
	const moved = new Set<string>();
	const at = mergeBaseOf(root, base);
	for (const file of changed) {
		if (!entries.some((entry) => entry.test(file))) continue;
		const before = showAt(root, at, file);
		const after = showAt(root, 'HEAD', file);
		const delta =
			after === undefined
				? undefined
				: exportDelta(before, after, (specifier) =>
						specifierPath(file, specifier),
					);
		if (delta === undefined || delta === '*' || delta.size > 0)
			moved.add(file);
	}
	return moved;
};

/** What the plan of a change since `base` is decided from, read from git. */
export const planInputSince = (base: string | undefined): IPlanInput => {
	if (base === undefined) return { changed: [] };
	const changed = changedSince(base);
	const root = repoRoot();
	const workflowJobs = changed.includes(TEST_WORKFLOW)
		? changedWorkflowJobs(
				showAt(root, mergeBaseOf(root, base), TEST_WORKFLOW),
				showAt(root, 'HEAD', TEST_WORKFLOW),
			)
		: undefined;
	return {
		changed,
		surfaceMoved: surfaceMovedSince(root, base, changed),
		structural: structuralSince(root, base),
		reached: jobsReachedSince(root, base, changed),
		...(workflowJobs === undefined ? {} : { workflowJobs }),
	};
};

const main = (): number => {
	const input = planInputSince(arg('base'));
	const { changed } = input;
	const plan = planJobs(input);

	for (const { job, runs, why } of explainJobs(input)) {
		console.log(`  ${runs ? 'run ' : 'skip'} ${job} — ${why}`);
	}
	console.log(
		`job-scope: ${Object.values(plan).filter(Boolean).length}/${Object.keys(plan).length} job(s) can be affected by ${changed.length} changed file(s).`,
	);

	if (process.argv.includes('--outputs')) {
		// One JSON output rather than one per job: a workflow reading
		// `fromJSON(...)['pack-smoke']` cannot typo a job name into a
		// silently empty string the way `outputs.pack-smoke` can.
		console.log(`plan=${JSON.stringify(plan)}`);
		console.log(`changed=${changedOutputOf(changed)}`);
		console.log(
			`not-applicable=${JSON.stringify(
				Object.entries(plan)
					.filter(([, runs]) => !runs)
					.map(([job]) => job),
			)}`,
		);
	}
	return 0;
};

if (import.meta.main) process.exit(main());
