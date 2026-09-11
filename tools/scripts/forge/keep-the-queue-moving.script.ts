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

import { REPOSITORY_SLUG } from '@delendai/core/lib/contracts/constants/repository-identity.constant';

const APPLY = process.argv.includes('--apply');

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
const mergeState = (number: number): string =>
	api<{ readonly mergeable_state?: string }>(
		`repos/${REPOSITORY_SLUG}/pulls/${number}`,
	).mergeable_state ?? 'unknown';

const hasFailure = (sha: string): boolean =>
	api<{
		readonly check_runs: readonly {
			readonly conclusion: string | null;
		}[];
	}>(`repos/${REPOSITORY_SLUG}/commits/${sha}/check-runs?per_page=100`)
		.check_runs.some((run) =>
			['failure', 'timed_out'].includes(run.conclusion ?? ''),
		);

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
	for (const pull of armed) {
		const state = mergeState(pull.number);
		if (state !== 'behind') continue;
		if (hasFailure(pull.head.sha)) {
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
};

main();
