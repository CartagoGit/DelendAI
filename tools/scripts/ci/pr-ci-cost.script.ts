#!/usr/bin/env bun

/**
 * pr-ci-cost — what a pull request's last successful CI run cost.
 *
 * Usage: `bun run ci:cost -- <pr> [<pr>…]`.
 *
 * A job is measured from its first step's start to its last step's end.
 * GitHub sometimes records a job as complete minutes after its last step
 * finished; that gap is not ours and must not count. Jobs with no timed
 * step (skipped) are not counted.
 */

import { execFileSync } from 'node:child_process';

import type { IGhJob, IJobCost, IPrCiCost } from './pr-ci-cost.interface';

const SLOWEST = 5;

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
	const wallMs =
		Math.max(...costs.map((each) => each.endMs)) -
		Math.min(...costs.map((each) => each.startMs));
	return {
		jobs: costs.length,
		runnerSeconds: costs.reduce((sum, each) => sum + each.seconds, 0),
		wallSeconds: Math.round(wallMs / 1000),
		slowest: [...costs]
			.sort((a, b) => b.seconds - a.seconds)
			.slice(0, SLOWEST),
	};
};

export const formatCost = (pr: string, cost: IPrCiCost): string =>
	[
		`#${pr}: ${cost.jobs} jobs, ${cost.runnerSeconds} runner-seconds, ${cost.wallSeconds} s wall`,
		...cost.slowest.map((each) => `  ${each.seconds}s  ${each.name}`),
	].join('\n');

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
	return formatCost(pr, summarize(jobs));
};

const main = (): number => {
	const prs = process.argv.slice(2).filter((each) => /^\d+$/.test(each));
	if (prs.length === 0) {
		console.error('usage: bun run ci:cost -- <pr> [<pr>…]');
		return 2;
	}
	for (const pr of prs) console.log(costOf(pr));
	return 0;
};

if (import.meta.main) process.exit(main());
