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

import { hookFreeEnvironment } from '../shared/hook-free-environment.helper';
import { ownActivityAt } from './unit-activity.helper';
import type { IInvariantResult } from '../contracts/interfaces/workflow-invariants.interface';
import {
	ABANDONED_AFTER_LEASE_WINDOWS,
	SECONDS_PER_MINUTE,
} from './unit-lease.constant';
import { leaseWindowSeconds } from './unit-verdict.service';

const git = (root: string, args: readonly string[]): string => {
	try {
		return execFileSync('git', [...args], {
			cwd: root,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
			env: hookFreeEnvironment(),
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
	/**
	 * Whether the ref's proposal is in progress. Its one wip branch
	 * outlives every pull request of that time, so a branch whose work
	 * landed is not hanging while that holds.
	 */
	readonly stillOpen?: ((ref: string) => boolean) | undefined;
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
		if (ahead === '0')
			return input.stillOpen?.(ref) === true
				? []
				: [{ ref, why: 'landed' }];
		// Dated by its own work, not by merges of the integration branch.
		const tipAt =
			ownActivityAt(
				(args) => git(input.root, args),
				tracked,
				`${input.remote}/${input.integration}`,
			) ?? 0;
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

/**
 * A publication still on the forge holds something the integration branch
 * lacks. One that holds nothing has landed, or never carried work: either
 * way it is a branch that looks like a pull request to come and is not.
 */
export const spentPublicationsInvariant = (input: {
	readonly root: string;
	readonly remote: string;
	readonly integration: string;
	readonly published: readonly string[];
}): IInvariantResult => {
	const { remote, integration, published } = input;
	const spent = published.filter(
		(ref) =>
			git(input.root, [
				'rev-list',
				'--count',
				`${remote}/${integration}..${remote}/${ref}`,
			]) === '0',
	);
	return {
		scope: 'forge',
		id: 'publications-hold-work',
		claim: `every publication holds work \`${integration}\` lacks`,
		holds: spent.length === 0,
		observed:
			published.length === 0
				? 'no publication refs'
				: spent.length === 0
					? `${String(published.length)} ref(s), all holding work`
					: `${String(spent.length)} spent: ${spent.slice(0, 3).join(', ')}`,
		// Retiring keeps the tip on the forge and records why; a bare
		// `git push --delete` keeps nothing and tells nobody.
		remedy: `its commits are already on \`${integration}\`: retire it (\`delendai work retire --ref=<ref> --reason="landed on ${integration}"\`)`,
	};
};

/**
 * A publication waits for a merge, and a merge takes hours at most. One
 * whose tip nobody has moved for longer than a unit is given before it
 * counts as abandoned is not waiting any more: its checks are red and its
 * author is gone, or it needs a decision nobody was told about. The queue
 * leaves such a candidate to its author, which is right while there is
 * one; this says so when there no longer is.
 */
export const stalledPublicationsInvariant = (input: {
	readonly root: string;
	readonly remote: string;
	readonly published: readonly string[];
	/**
	 * The integration branch: given, a publication is dated by its own
	 * work, not by the queue merging the integration branch into it.
	 */
	readonly integration?: string | undefined;
	readonly leaseTtlMinutes: number;
	/** Seconds since the epoch; the clock, unless a test says otherwise. */
	readonly now?: number | undefined;
}): IInvariantResult => {
	const now = input.now ?? Math.floor(Date.now() / 1000);
	const limit = abandonedAfterSeconds(input.leaseTtlMinutes);
	const stalled = input.published.flatMap((ref) => {
		const tracked = `${input.remote}/${ref}`;
		const tipAt =
			input.integration === undefined
				? Number(
						git(input.root, ['log', '-1', '--format=%ct', tracked]),
					)
				: (ownActivityAt(
						(args) => git(input.root, args),
						tracked,
						`${input.remote}/${input.integration}`,
					) ?? 0);
		// A ref this clone never fetched cannot be dated: not judged.
		if (!Number.isFinite(tipAt) || tipAt === 0) return [];
		const silent = now - tipAt;
		return silent > limit
			? [
					`${ref} (${String(Math.round(silent / SECONDS_PER_MINUTE / 60))} h)`,
				]
			: [];
	});
	return {
		scope: 'forge',
		id: 'publications-move',
		claim: 'no publication sits unmoved after its author has gone',
		holds: stalled.length === 0,
		observed:
			input.published.length === 0
				? 'no publication refs'
				: stalled.length === 0
					? `${String(input.published.length)} ref(s), none stalled`
					: `${String(stalled.length)} stalled: ${stalled.slice(0, 3).join(', ')}`,
		remedy: 'read why its pull request is not merging (its failing check, or the decision it waits for), then fix it on its own publication or retire it (`delendai work retire --ref=<ref> --reason="<why>"`)',
	};
};
