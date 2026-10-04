/**
 * forge-work-refs.service.ts — which work refs on the forge hang.
 *
 * A live unit's ref is on the forge on purpose: the server pushes it so a
 * lost machine loses no work. Whether somebody is in it is written in a
 * lease, and the lease lives in the clone that entered the unit. A runner
 * has no such clone, so it could not tell a backup from an abandoned ref,
 * called every one broken, and the queue's report was silenced with
 * `|| true` to stay green: a run that left twenty branches behind looked
 * finished.
 *
 * What a ref on the forge says by itself is enough to judge it anywhere.
 * One that holds nothing the integration branch lacks has landed, and one
 * whose last commit is older than the time a silent unit is given has been
 * left. Anything else is somebody's work in progress.
 */
import { execFileSync } from 'node:child_process';

import { HOOK_GIT_ENVIRONMENT } from '../contracts/constants/hook-git-environment.constant';
import {
	ABANDONED_AFTER_LEASE_WINDOWS,
	SECONDS_PER_MINUTE,
} from './unit-lease.constant';
import { leaseWindowSeconds } from './unit-verdict.service';

const git = (root: string, args: readonly string[]): string => {
	const environment = { ...process.env };
	for (const name of HOOK_GIT_ENVIRONMENT) delete environment[name];
	try {
		return execFileSync('git', [...args], {
			cwd: root,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
			env: environment,
		}).trim();
	} catch {
		return '';
	}
};

/** How long a unit may be silent before it counts as left, in seconds. */
export const abandonedAfterSeconds = (leaseTtlMinutes: number): number =>
	leaseWindowSeconds(leaseTtlMinutes) * ABANDONED_AFTER_LEASE_WINDOWS;

/**
 * Of `refs` (work refs on the forge that no worktree here stands on), the
 * ones that hang: landed, or silent for longer than a unit is given.
 */
export const hangingForgeWorkRefs = (input: {
	readonly root: string;
	readonly remote: string;
	readonly integration: string;
	readonly refs: readonly string[];
	readonly leaseTtlMinutes: number;
	/** Seconds since the epoch; the clock, unless a test says otherwise. */
	readonly now?: number | undefined;
}): readonly { readonly ref: string; readonly why: string }[] => {
	const now = input.now ?? Math.floor(Date.now() / 1000);
	const limit = abandonedAfterSeconds(input.leaseTtlMinutes);
	return input.refs.flatMap((ref) => {
		const tracked = `${input.remote}/${ref}`;
		const ahead = git(input.root, [
			'rev-list',
			'--count',
			`${input.remote}/${input.integration}..${tracked}`,
		]);
		if (ahead === '0') return [{ ref, why: 'landed' }];
		const tipAt = Number(
			git(input.root, ['log', '-1', '--format=%ct', tracked]),
		);
		// A ref this clone never fetched cannot be dated: not judged.
		if (!Number.isFinite(tipAt) || tipAt === 0) return [];
		const silent = now - tipAt;
		return silent > limit
			? [
					{
						ref,
						why: `silent ${String(Math.round(silent / SECONDS_PER_MINUTE / 60))} h`,
					},
				]
			: [];
	});
};
