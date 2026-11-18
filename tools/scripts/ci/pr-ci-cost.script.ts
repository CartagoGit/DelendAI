#!/usr/bin/env bun

/**
 * pr-ci-cost — what a pull request's last successful CI run cost.
 *
 * Usage: `bun run ci:cost -- <pr> [<pr>…]`, or `-- --weekly` for the weekly
 * report: develop red hours, open-to-merge p50/p90, runs per PR, top failure
 * causes and the land KPIs, each over-threshold one named with its number.
 *
 * A job is measured from its first step's start to its last step's end.
 * GitHub sometimes records a job as complete minutes after its last step
 * finished; that gap is not ours and must not count. Jobs with no timed
 * step (skipped) are not counted.
 */

import { execFileSync } from 'node:child_process';

import { judgePrCiWall, wallSecondsOf } from '@delendai/integration';

import type {
	IFailureCause,
	IGhJob,
	IJobCost,
	IKpiBreach,
	IMergedPr,
	IPrCiCost,
	IPrRun,
	IWeeklyCost,
	IWeeklyInput,
} from './pr-ci-cost.interface';

const SLOWEST = 5;
const TOP_FAILURES = 5;
/** A commit that coordinates rather than delivers: the same subjects `work status` counts as bookkeeping. */
const BOOKKEEPING = /^chore\((?:generated|delendai|review)\)[:!]/u;
const HOUR_MS = 3_600_000;
const WEEK_MS = 7 * 24 * HOUR_MS;
const UNEXPLAINED_WAIT_MS = 30 * 60_000;

/** The thresholds of the weekly KPIs (q00046 S7). */
export const KPI_THRESHOLDS = {
	readyToMergedP50Minutes: 30,
	humanMerges: 0,
	unexplainedWaits: 0,
	bookkeepingShare: 0.1,
} as const;

/** One job's cost, or undefined when no step ran. */
export const jobCost = (job: IGhJob): IJobCost | undefined => {
	const starts: number[] = [];
	const ends: number[] = [];
	for (const step of job.steps) {
		if (step.started_at === null || step.completed_at === null) continue;
		starts.push(Date.parse(step.started_at));
		ends.push(Date.parse(step.completed_at));
	}
	if (starts.length === 0) return undefined;
	const startMs = Math.min(...starts);
	const endMs = Math.max(...ends);
	return {
		name: job.name,
		startMs,
		endMs,
		seconds: Math.max(0, Math.round((endMs - startMs) / 1000)),
	};
};

/** Totals for one run: runner seconds sum jobs, wall spans first start to last end. */
export const summarize = (jobs: readonly IGhJob[]): IPrCiCost => {
	const costs = jobs
		.map(jobCost)
		.filter((each): each is IJobCost => each !== undefined);
	if (costs.length === 0)
		return { jobs: 0, runnerSeconds: 0, wallSeconds: 0, slowest: [] };
	return {
		jobs: costs.length,
		runnerSeconds: costs.reduce((sum, each) => sum + each.seconds, 0),
		wallSeconds: wallSecondsOf(costs),
		slowest: [...costs]
			.sort((a, b) => b.seconds - a.seconds)
			.slice(0, SLOWEST),
	};
};

/** The same verdict the rehearsal report gives, against the target for a plain pull request. */
const wallVerdict = (wallSeconds: number): string => {
	const verdict = judgePrCiWall(wallSeconds, false);
	return `${verdict.ok ? 'within' : 'over'} the ${String(verdict.thresholdMinutes)} min target`;
};

export const formatCost = (pr: string, cost: IPrCiCost): string =>
	[
		`#${pr}: ${cost.jobs} jobs, ${cost.runnerSeconds} runner-seconds, ${cost.wallSeconds} s wall`,
		...cost.slowest.map((each) => `  ${each.seconds}s  ${each.name}`),
	].join('\n');

/** Nearest-rank percentile of `values`; 0 when there are none. */
export const percentile = (values: readonly number[], p: number): number => {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
	return sorted[rank - 1] ?? 0;
};

/** UTC Monday, `YYYY-MM-DD`, of the week holding `ms`. */
export const weekOf = (ms: number): string => {
	const day = new Date(ms);
	const sinceMonday = (day.getUTCDay() + 6) % 7;
	return new Date(
		Date.UTC(
			day.getUTCFullYear(),
			day.getUTCMonth(),
			day.getUTCDate() - sinceMonday,
		),
	)
		.toISOString()
		.slice(0, 10);
};

const round = (value: number, places: number): number => {
	const scale = 10 ** places;
	return Math.round(value * scale) / scale;
};

/**
 * Hours develop was red per week: from a failed run to the next green one
 * (or `nowMs`), split at week boundaries.
 */
export const redHoursByWeek = (
	runs: readonly {
		readonly createdAt: string;
		readonly conclusion: string;
	}[],
	nowMs: number,
): ReadonlyMap<string, number> => {
	const hours = new Map<string, number>();
	const ordered = runs
		.filter(
			(each) =>
				each.conclusion === 'success' || each.conclusion === 'failure',
		)
		.map((each) => ({
			at: Date.parse(each.createdAt),
			ok: each.conclusion === 'success',
		}))
		.sort((a, b) => a.at - b.at);
	let redSince: number | undefined;
	const close = (until: number): void => {
		if (redSince === undefined) return;
		let cursor = redSince;
		while (cursor < until) {
			const next = Math.min(until, Date.parse(weekOf(cursor)) + WEEK_MS);
			const week = weekOf(cursor);
			hours.set(week, (hours.get(week) ?? 0) + (next - cursor) / HOUR_MS);
			cursor = next;
		}
		redSince = undefined;
	};
	for (const run of ordered) {
		if (run.ok) close(run.at);
		else redSince ??= run.at;
	}
	close(nowMs);
	return hours;
};

/** Milliseconds of `[from, to]` that no run interval covers. */
const uncoveredMs = (
	from: number,
	to: number,
	runs: readonly IPrRun[],
): number => {
	const spans = runs
		.map(
			(each) =>
				[Date.parse(each.startedAt), Date.parse(each.endedAt)] as const,
		)
		.sort((a, b) => a[0] - b[0]);
	let covered = 0;
	let cursor = from;
	for (const [start, end] of spans) {
		const lo = Math.max(start, cursor);
		const hi = Math.min(end, to);
		if (hi > lo) {
			covered += hi - lo;
			cursor = hi;
		}
	}
	return Math.max(0, to - from - covered);
};

const isHumanMerge = (pr: IMergedPr): boolean => !pr.mergedBy.endsWith('[bot]');

const topFailures = (runs: readonly IPrRun[]): readonly IFailureCause[] => {
	const counts = new Map<string, number>();
	for (const run of runs)
		for (const job of run.failedJobs)
			counts.set(job, (counts.get(job) ?? 0) + 1);
	return [...counts]
		.map(([name, count]) => ({ name, count }))
		.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
		.slice(0, TOP_FAILURES);
};

/** The report, one row per week with merged pull requests or red time. */
export const weeklyCost = (input: IWeeklyInput): readonly IWeeklyCost[] => {
	const red = redHoursByWeek(input.developRuns, input.nowMs);
	const prsByWeek = new Map<string, IMergedPr[]>();
	for (const pr of input.prs) {
		const week = weekOf(Date.parse(pr.mergedAt));
		prsByWeek.set(week, [...(prsByWeek.get(week) ?? []), pr]);
	}
	const linesByWeek = new Map<string, string[]>();
	for (const line of input.commitLog.split('\n')) {
		const [date = '', ...rest] = line.split('\t');
		if (date === '') continue;
		const week = weekOf(Date.parse(date));
		linesByWeek.set(week, [
			...(linesByWeek.get(week) ?? []),
			rest.join('\t'),
		]);
	}
	const weeks = [...new Set([...red.keys(), ...prsByWeek.keys()])].sort();
	return weeks.map((week): IWeeklyCost => {
		const prs = prsByWeek.get(week) ?? [];
		const numbers = new Set(prs.map((each) => each.number));
		const runs = input.prRuns.filter((each) => numbers.has(each.pr));
		const ms = (from: string, to: string): number =>
			Date.parse(to) - Date.parse(from);
		const lines = linesByWeek.get(week) ?? [];
		const bookkeeping = lines.filter((line) => {
			const [parents = '', subject = ''] = line.split('\t');
			return (
				parents.trim().split(' ').length === 1 &&
				BOOKKEEPING.test(subject)
			);
		}).length;
		return {
			week,
			developRedHours: round(red.get(week) ?? 0, 1),
			merged: prs.length,
			openToMergeP50Hours: round(
				percentile(
					prs.map((p) => ms(p.createdAt, p.mergedAt) / HOUR_MS),
					50,
				),
				2,
			),
			openToMergeP90Hours: round(
				percentile(
					prs.map((p) => ms(p.createdAt, p.mergedAt) / HOUR_MS),
					90,
				),
				2,
			),
			runsPerPr:
				prs.length === 0 ? 0 : round(runs.length / prs.length, 2),
			topFailures: topFailures(runs),
			readyToMergedP50Minutes: round(
				percentile(
					prs.map((p) => ms(p.readyAt, p.mergedAt) / 60_000),
					50,
				),
				1,
			),
			humanMerges: prs.filter(isHumanMerge).length,
			unexplainedWaits: prs.filter(
				(p) =>
					uncoveredMs(
						Date.parse(p.readyAt),
						Date.parse(p.mergedAt),
						runs.filter((r) => r.pr === p.number),
					) > UNEXPLAINED_WAIT_MS,
			).length,
			bookkeepingShare:
				lines.length === 0 ? 0 : round(bookkeeping / lines.length, 3),
		};
	});
};

/** Every KPI of `row` over its threshold, by name with the number. */
export const kpiBreaches = (row: IWeeklyCost): readonly IKpiBreach[] =>
	(
		[
			[
				'ready-to-merged p50 (minutes)',
				row.readyToMergedP50Minutes,
				KPI_THRESHOLDS.readyToMergedP50Minutes,
			],
			['human merges', row.humanMerges, KPI_THRESHOLDS.humanMerges],
			[
				'unexplained waits over 30 minutes',
				row.unexplainedWaits,
				KPI_THRESHOLDS.unexplainedWaits,
			],
			[
				'bookkeeping commit share',
				row.bookkeepingShare,
				KPI_THRESHOLDS.bookkeepingShare,
			],
		] as const
	)
		.filter(([, value, threshold]) => value > threshold)
		.map(([name, value, threshold]) => ({ name, value, threshold }));

export const formatWeekly = (rows: readonly IWeeklyCost[]): string =>
	rows
		.flatMap((row) => [
			`week ${row.week}: develop red ${row.developRedHours} h; ${row.merged} merged, open-to-merge p50 ${row.openToMergeP50Hours} h, p90 ${row.openToMergeP90Hours} h; ${row.runsPerPr} runs per PR`,
			`  top failures: ${row.topFailures.length === 0 ? 'none' : row.topFailures.map((f) => `${f.name} x${f.count}`).join(', ')}`,
			`  ready-to-merged p50 ${row.readyToMergedP50Minutes} min; human merges ${row.humanMerges}; unexplained waits over 30 min ${row.unexplainedWaits}; bookkeeping ${round(row.bookkeepingShare * 100, 1)}%`,
			...kpiBreaches(row).map(
				(b) =>
					`  OVER THRESHOLD: ${b.name} = ${b.value} (limit ${b.threshold})`,
			),
		])
		.join('\n');

const gh = (...args: string[]): string =>
	execFileSync('gh', ['api', ...args], { encoding: 'utf8' }).trim();

const costOf = (pr: string): string => {
	const sha = gh(`repos/{owner}/{repo}/pulls/${pr}`, '--jq', '.head.sha');
	const run = gh(
		`repos/{owner}/{repo}/actions/runs?head_sha=${sha}&status=success&per_page=100`,
		'--jq',
		'[.workflow_runs[] | select(.name == "CI")] | sort_by(.created_at) | last | .id // empty',
	);
	if (run === '') return `#${pr}: no successful CI run for ${sha}`;
	const jobs = gh(
		'--paginate',
		`repos/{owner}/{repo}/actions/runs/${run}/jobs?per_page=100`,
		'--jq',
		'.jobs[] | {name, steps: [.steps[] | {started_at, completed_at}]}',
	)
		.split('\n')
		.filter((line) => line !== '')
		.map((line) => JSON.parse(line) as IGhJob);
	const cost = summarize(jobs);
	return `${formatCost(pr, cost)}\n  wall time: ${wallVerdict(cost.wallSeconds)}`;
};

const ghJson = <T>(...args: string[]): T =>
	JSON.parse(
		execFileSync('gh', ['api', ...args], {
			encoding: 'utf8',
			maxBuffer: 64 << 20,
		}),
	) as T;

interface IApiPr {
	readonly number: number;
	readonly created_at: string;
	readonly merged_at: string | null;
	readonly merged_by: { readonly login: string } | null;
}
interface IApiRun {
	readonly id: number;
	readonly run_started_at: string;
	readonly updated_at: string;
	readonly conclusion: string | null;
	readonly created_at: string;
	readonly pull_requests: readonly { readonly number: number }[];
}

const weekly = (): string => {
	const prs = ghJson<readonly IApiPr[]>(
		'repos/{owner}/{repo}/pulls?state=closed&base=develop&per_page=100&sort=updated&direction=desc',
	)
		.filter((each) => each.merged_at !== null)
		.map((each): IMergedPr => {
			const events = ghJson<
				readonly { event: string; created_at: string }[]
			>(
				`repos/{owner}/{repo}/issues/${each.number}/timeline?per_page=100`,
			);
			const ready = events.find((e) => e.event === 'ready_for_review');
			return {
				number: each.number,
				createdAt: each.created_at,
				readyAt: ready?.created_at ?? each.created_at,
				mergedAt: each.merged_at ?? each.created_at,
				mergedBy: each.merged_by?.login ?? 'unknown',
			};
		});
	const wanted = new Set(prs.map((each) => each.number));
	const runs = (query: string): readonly IApiRun[] =>
		ghJson<{ workflow_runs: readonly IApiRun[] }>(
			`repos/{owner}/{repo}/actions/runs?per_page=100&${query}`,
		).workflow_runs;
	const prRuns = runs('event=pull_request').flatMap((run): IPrRun[] => {
		const pr = run.pull_requests[0]?.number;
		if (pr === undefined || !wanted.has(pr)) return [];
		const failedJobs =
			run.conclusion === 'failure'
				? ghJson<{
						jobs: readonly {
							name: string;
							conclusion: string | null;
						}[];
					}>(
						`repos/{owner}/{repo}/actions/runs/${run.id}/jobs?per_page=100`,
					)
						.jobs.filter((job) => job.conclusion === 'failure')
						.map((job) => job.name)
				: [];
		return [
			{
				pr,
				startedAt: run.run_started_at,
				endedAt: run.updated_at,
				conclusion: run.conclusion ?? 'unknown',
				failedJobs,
			},
		];
	});
	const developRuns = runs('branch=develop&event=push').map((run) => ({
		createdAt: run.created_at,
		conclusion: run.conclusion ?? 'unknown',
	}));
	const commitLog = execFileSync(
		'git',
		[
			'log',
			'--first-parent',
			'--since=8 weeks ago',
			'--format=%aI%x09%P%x09%s',
			'origin/develop',
		],
		{ encoding: 'utf8', maxBuffer: 64 << 20 },
	);
	return formatWeekly(
		weeklyCost({ prs, prRuns, developRuns, commitLog, nowMs: Date.now() }),
	);
};

const main = (): number => {
	if (process.argv.slice(2).includes('--weekly')) {
		console.log(weekly());
		return 0;
	}
	const prs = process.argv.slice(2).filter((each) => /^\d+$/.test(each));
	if (prs.length === 0) {
		console.error('usage: bun run ci:cost -- <pr> [<pr>…] | --weekly');
		return 2;
	}
	for (const pr of prs) console.log(costOf(pr));
	return 0;
};

if (import.meta.main) process.exit(main());
