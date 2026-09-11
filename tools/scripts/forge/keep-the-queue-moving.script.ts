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
	const failing: string[] = [];
	for (const pull of armed) {
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
		console.log(`keep-the-queue-moving: updated #${pull.number}.`);
	}

	console.log(
		`keep-the-queue-moving: ${armed.length} armed, ${updated} updated.`,
	);

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

main();
