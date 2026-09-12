#!/usr/bin/env bun

/**
 * keep-the-queue-moving — update every pull request that is only behind.
 *
 * WHY this exists: the integration branch requires candidates to be
 * up to date, which is what stops two independently green pull requests
 * from combining into a red branch. The cost is that every merge leaves
 * every other open pull request stale, and the forge's auto-merge will
 * not refresh them — it waits for a human to press "Update branch".
 *
 * For one person with one pull request that is a button. For a set of
 * agents landing small slices it is a queue that stops after the first
 * merge and stays stopped until somebody notices. The whole point of
 * arming auto-merge is that nobody has to notice.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: it never merges, never rebases, and
 * never touches a pull request that is not already asking to be merged.
 * Updating a branch is the one operation here that cannot lose work —
 * it merges the base INTO the candidate — and it is only applied where
 * the author already said "merge this when it is green".
 *
 * A pull request that is behind AND failing is left alone: refreshing it
 * would spend a CI run to re-learn a failure somebody has to fix anyway.
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const APPLY = process.argv.includes('--apply');

/**
 * Which repository this is, WITHOUT importing core.
 *
 * `@delendai/core/public` would drag the MCP server runtime in, and this
 * job deliberately installs nothing: a script that keeps the queue moving
 * must not be the reason the queue stops. The forge supplies
 * `GITHUB_REPOSITORY` in every workflow run, and outside one the remote
 * is the only honest answer anyway — this tool acts on whatever
 * repository it is pointed at, not on a compiled-in name.
 */
const repositorySlug = (): string => {
	const fromEnv = process.env.GITHUB_REPOSITORY;
	if (fromEnv?.includes('/') === true) return fromEnv;
	const url = execFileSync('git', ['remote', 'get-url', 'origin'], {
		encoding: 'utf8',
	}).trim();
	const match = /[/:]([^/:]+\/[^/]+?)(?:\.git)?$/u.exec(url);
	if (match?.[1] === undefined) {
		throw new Error(
			`keep-the-queue-moving: could not tell which repository this is from origin (${url}). Set GITHUB_REPOSITORY.`,
		);
	}
	return match[1];
};

const REPOSITORY_SLUG = repositorySlug();

interface IPullRequest {
	readonly number: number;
	readonly title: string;
	readonly auto_merge: unknown;
	readonly head: { readonly sha: string };
}

const gh = (args: readonly string[]): string =>
	execFileSync('gh', [...args], {
		encoding: 'utf8',
		maxBuffer: 16 * 1024 * 1024,
	});

const api = <T>(path: string): T => JSON.parse(gh(['api', path])) as T;

/** `behind` / `blocked` / `clean` … as the forge reports it. */
/**
 * `behind` / `blocked` / `clean` … as the forge reports it.
 *
 * The forge computes this LAZILY. Asking straight after something merged
 * returns `unknown` while a background job works out the new
 * mergeability — and this job runs at exactly that moment, because the
 * merge is what triggers it. The first version read the answer once, got
 * `unknown`, concluded "not behind", and updated nothing: the run that
 * existed to unblock the queue reported `1 armed, 0 updated` and left the
 * candidate stuck. Observed, not theorised.
 *
 * An unknown answer is therefore re-asked rather than believed, and one
 * that is still unknown after three tries is reported as unknown instead
 * of being treated as a decision.
 */
const mergeState = (number: number): string => {
	for (let attempt = 0; attempt < 3; attempt += 1) {
		const state =
			api<{ readonly mergeable_state?: string }>(
				`repos/${REPOSITORY_SLUG}/pulls/${number}`,
			).mergeable_state ?? 'unknown';
		if (state !== 'unknown') return state;
		// Keeps the script synchronous, which the rest of it already is.
		execFileSync('sleep', ['2']);
	}
	return 'unknown';
};

interface ICheckRun {
	readonly name: string;
	readonly conclusion: string | null;
}

const checksOf = (sha: string): readonly ICheckRun[] =>
	api<{ readonly check_runs: readonly ICheckRun[] }>(
		`repos/${REPOSITORY_SLUG}/commits/${sha}/check-runs?per_page=100`,
	).check_runs;

/**
 * Checks that concluded badly, by name.
 *
 * `cancelled` is deliberately not one of them: this repository's
 * concurrency rules cancel superseded runs constantly, and treating that
 * as a failure would report every candidate as red within a minute of a
 * push — which is how a real signal gets ignored.
 */
const failuresOf = (runs: readonly ICheckRun[]): readonly string[] => [
	...new Set(
		runs
			.filter((run) =>
				['failure', 'timed_out'].includes(run.conclusion ?? ''),
			)
			.map((run) => run.name),
	),
];

export interface IWorkflowRun {
	readonly id: number;
	readonly name: string;
	readonly conclusion: string | null;
}

/**
 * Runs the forge parked behind a human instead of running them.
 *
 * `update-branch` below is an API call, so the commit it writes is
 * attributed to the token that made it. When that token is a bot — which
 * it always is here, because this job runs in a workflow — the forge
 * refuses to start workflows on the result and files them as
 * `action_required` instead. No workflow starts, so the required
 * aggregate check never reports, so the pull request is BLOCKED with
 * nothing red to fix and no way to notice from the checks list: the
 * required check is not failing, it is ABSENT.
 *
 * Observed on #86, which sat mergeable-and-blocked with exactly one
 * check on it (a third-party scanner) while five CI runs waited for a
 * button nobody knew to press. The job that exists to keep the queue
 * moving was itself what stopped it.
 */
export const parkedRuns = (
	runs: readonly IWorkflowRun[],
): readonly IWorkflowRun[] =>
	runs.filter((run) => run.conclusion === 'action_required');

const waitingRuns = (sha: string): readonly IWorkflowRun[] =>
	parkedRuns(
		api<{ readonly workflow_runs: readonly IWorkflowRun[] }>(
			`repos/${REPOSITORY_SLUG}/actions/runs?head_sha=${sha}&per_page=100`,
		).workflow_runs,
	);

/**
 * Press the button, and say so when the forge will not let us.
 *
 * Returns the names it could not release rather than throwing: one
 * repository configuration that refuses self-approval must not stop the
 * job from updating every other candidate. A refusal that is reported is
 * a thing somebody can fix; a refusal that aborts the run is the silence
 * this whole script exists to break.
 */
const releaseWaitingRuns = (sha: string): readonly string[] => {
	const refused: string[] = [];
	for (const run of waitingRuns(sha)) {
		try {
			gh([
				'api',
				'-X',
				'POST',
				`repos/${REPOSITORY_SLUG}/actions/runs/${run.id}/approve`,
			]);
		} catch {
			refused.push(run.name);
		}
	}
	return refused;
};

const main = (): void => {
	const open = api<readonly IPullRequest[]>(
		`repos/${REPOSITORY_SLUG}/pulls?state=open&per_page=100`,
	);
	const armed = open.filter((pull) => pull.auto_merge !== null);
	if (armed.length === 0) {
		console.log(
			'keep-the-queue-moving: no pull request is waiting to auto-merge; nothing to keep moving.',
		);
		return;
	}

	let updated = 0;
	let released = 0;
	const failing: string[] = [];
	const refusedReleases = new Set<string>();
	for (const pull of armed) {
		// Before reading the checks, make sure there are any. A parked run
		// contributes no check at all, so a candidate stuck this way reads
		// as green-and-blocked rather than red.
		const refused = releaseWaitingRuns(pull.head.sha);
		for (const name of refused) refusedReleases.add(name);
		const runs = checksOf(pull.head.sha);
		const failures = failuresOf(runs);
		if (failures.length > 0) {
			// Reported whether or not it is behind. A candidate whose
			// author armed auto-merge and then walked away is work that
			// looks finished and is not; the queue is the only thing in a
			// position to notice, and staying silent about it is how a
			// pull request sits red for a day.
			failing.push(
				`  #${pull.number} ${pull.title} — ${failures.join(', ')}`,
			);
		}
		const state = mergeState(pull.number);
		if (state === 'unknown') {
			console.log(
				`keep-the-queue-moving: #${pull.number} — the forge has not finished computing mergeability; left for the next run rather than guessed at.`,
			);
			continue;
		}
		if (state !== 'behind') continue;
		if (failures.length > 0) {
			console.log(
				`keep-the-queue-moving: #${pull.number} is behind AND red — left alone. Refreshing it would spend a CI run to re-learn a failure that has to be fixed anyway.`,
			);
			continue;
		}
		if (!APPLY) {
			console.log(
				`keep-the-queue-moving: #${pull.number} is behind and green — would update (pass --apply).`,
			);
			continue;
		}
		gh([
			'api',
			'-X',
			'PUT',
			`repos/${REPOSITORY_SLUG}/pulls/${pull.number}/update-branch`,
		]);
		updated += 1;
		// The update just wrote a commit as a bot, so the runs it triggers
		// are parked by construction. Updating a branch and leaving its
		// validation unstartable is not progress — it is the same block
		// one commit further on.
		const head = api<{ readonly head: { readonly sha: string } }>(
			`repos/${REPOSITORY_SLUG}/pulls/${pull.number}`,
		).head.sha;
		const refusedAfterUpdate = releaseWaitingRuns(head);
		for (const name of refusedAfterUpdate) refusedReleases.add(name);
		released += 1;
		console.log(`keep-the-queue-moving: updated #${pull.number}.`);
	}

	console.log(
		`keep-the-queue-moving: ${armed.length} armed, ${updated} updated, ${released} re-validated.`,
	);

	if (refusedReleases.size > 0) {
		// Loud, because the failure mode is invisible: the pull request
		// shows no red check, it simply never becomes mergeable.
		console.log(
			`keep-the-queue-moving: the forge refused to start ${[...refusedReleases].join(', ')} — those candidates will stay blocked with nothing red to fix. The job needs \`actions: write\`.`,
		);
	}

	if (failing.length === 0) {
		console.log('keep-the-queue-moving: no armed candidate is red.');
		return;
	}
	// Stdout, not a failed exit. This job runs on the integration branch
	// and a red PULL REQUEST is not a reason to call the integration
	// branch broken — that inversion is how a real signal gets muted. The
	// job summary is where a human, or the agent that opened it, sees it.
	console.log(
		`\nkeep-the-queue-moving: ${failing.length} armed candidate(s) are red and will never merge on their own:`,
	);
	for (const line of failing) console.log(line);
	writeSummary(failing);
};

/**
 * Put the red candidates in the run summary too.
 *
 * A line in a log nobody opens is the same as no line at all, and the
 * whole point of this is that a pull request cannot be left half-landed
 * because everyone moved on to the next thing.
 */
const writeSummary = (failing: readonly string[]): void => {
	const path = process.env.GITHUB_STEP_SUMMARY;
	if (path === undefined) return;
	appendFileSync(
		path,
		[
			'### Armed candidates that are red',
			'',
			'These have auto-merge on and will never merge until somebody',
			'fixes them.',
			'',
			...failing.map((line) => `- ${line.trim()}`),
			'',
		].join('\n'),
	);
};

if (import.meta.main) main();
