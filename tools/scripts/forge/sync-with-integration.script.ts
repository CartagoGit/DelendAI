#!/usr/bin/env bun

/**
 * sync-with-integration — make the local clone tell the truth about the
 * integration branch, without ever discarding work that is only here.
 *
 * WHY this exists: a pull request merging is an event that happens on
 * the forge. Nothing about it reaches this machine. The local
 * integration branch then sits at whatever it was, every agent reading
 * it plans against a state that no longer exists, and every branch cut
 * from it starts life behind — so the next pull request is stale before
 * its first commit. Observed repeatedly: one pull request lands, the
 * others do not, and no local ref moves.
 *
 * WHAT IT DELIBERATELY WILL NOT DO: it never resets, never forces, and
 * never advances a branch that has commits of its own. A clone that has
 * drifted is a question for a human; a clone that is merely behind is
 * arithmetic. Refusing to tell those two apart is how "sync" becomes
 * "lost an afternoon's work".
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { repoRoot } from '../lib/repo-root';

import {
	DEFAULT_INTEGRATION_BRANCH,
	SYNC_REMOTE,
} from './sync-with-integration.constant';
import type {
	ILocalSyncVerdict,
	ISyncCounts,
} from './sync-with-integration.interface';

export type {
	ILocalSyncVerdict,
	ISyncCounts,
} from './sync-with-integration.interface';

const APPLY = process.argv.includes('--apply');

/**
 * What to do with the local integration branch, from counts alone.
 *
 * Pure on purpose. The dangerous half of this script is the decision,
 * not the git invocation, and a decision expressed as arithmetic can be
 * pinned by cases that include the one nobody wants to discover live:
 * a branch that is behind AND ahead.
 */
export const localSyncVerdict = (counts: ISyncCounts): ILocalSyncVerdict => {
	if (counts.ahead > 0 && counts.behind > 0) return 'diverged';
	if (counts.ahead > 0) return 'ahead';
	if (counts.behind > 0) return 'fast-forward';
	return 'already-current';
};

/** The one-line reason, so the verdict never travels without it. */
export const syncExplanation = (
	verdict: ILocalSyncVerdict,
	branch: string,
	counts: ISyncCounts,
): string => {
	if (verdict === 'already-current')
		return `${branch} already matches ${SYNC_REMOTE}/${branch}.`;
	if (verdict === 'fast-forward')
		return `${branch} is ${counts.behind} commit(s) behind ${SYNC_REMOTE}/${branch} and has none of its own — safe to advance.`;
	if (verdict === 'ahead')
		return `${branch} is ${counts.ahead} commit(s) ahead of ${SYNC_REMOTE}/${branch}. Nothing to pull; those commits are not published anywhere.`;
	return `${branch} has ${counts.ahead} commit(s) of its own AND is ${counts.behind} behind ${SYNC_REMOTE}/${branch}. Left untouched: advancing it would need a merge or a rebase, and neither is this script's decision to make.`;
};

const git = (args: readonly string[]): string =>
	execFileSync('git', [...args], {
		cwd: repoRoot(),
		encoding: 'utf8',
		maxBuffer: 16 * 1024 * 1024,
	}).trim();

/**
 * The integration branch as the project declared it.
 *
 * Read from the config rather than hard-coded, because this script is
 * the thing that keeps a consuming project's clone honest and those
 * projects do not all call it `develop`. Read as JSON rather than
 * through core, because a script that must run before anything is built
 * cannot depend on a build.
 */
const integrationBranch = (): string => {
	try {
		const raw = readFileSync(
			join(repoRoot(), 'delendai.config.json'),
			'utf8',
		);
		const parsed = JSON.parse(raw) as {
			readonly development?: {
				readonly branches?: { readonly integration?: string };
			};
		};
		return (
			parsed.development?.branches?.integration ??
			DEFAULT_INTEGRATION_BRANCH
		);
	} catch {
		return DEFAULT_INTEGRATION_BRANCH;
	}
};

const counts = (branch: string): ISyncCounts => {
	const [ahead = '0', behind = '0'] = git([
		'rev-list',
		'--left-right',
		'--count',
		`${branch}...${SYNC_REMOTE}/${branch}`,
	]).split(/\s+/u);
	return { ahead: Number(ahead), behind: Number(behind) };
};

/**
 * Advance the branch without switching to it.
 *
 * `update-ref` rather than `merge --ff-only` so the shared checkout is
 * never moved out from under whoever is editing in it — the same reason
 * every publication ref in this repo is written with plumbing. When the
 * branch IS the checked-out one, `merge --ff-only` is the only correct
 * verb, and it is a fast-forward by construction because the verdict
 * said so.
 */
const advance = (branch: string): void => {
	const checkedOut = git(['rev-parse', '--abbrev-ref', 'HEAD']);
	if (checkedOut === branch) {
		git(['merge', '--ff-only', `${SYNC_REMOTE}/${branch}`]);
		return;
	}
	git([
		'update-ref',
		`refs/heads/${branch}`,
		git(['rev-parse', `${SYNC_REMOTE}/${branch}`]),
	]);
};

const main = (): number => {
	const branch = integrationBranch();
	// `--prune` is the half that makes the clone honest about deletions:
	// a merged pull request's branch is gone on the forge, and a stale
	// remote-tracking ref for it is indistinguishable from live work.
	git(['fetch', '--prune', '--quiet', SYNC_REMOTE]);

	const measured = counts(branch);
	const verdict = localSyncVerdict(measured);
	console.log(
		`sync-with-integration: ${verdict} — ${syncExplanation(verdict, branch, measured)}`,
	);

	if (verdict === 'diverged') return 1;
	if (verdict !== 'fast-forward') return 0;
	if (!APPLY) {
		console.log('sync-with-integration: would advance it (pass --apply).');
		return 0;
	}
	advance(branch);
	console.log(
		`sync-with-integration: advanced ${branch} to ${SYNC_REMOTE}/${branch}.`,
	);
	return 0;
};

if (import.meta.main) process.exit(main());
