/**
 * review-releases.service.ts — what a reviewer gave back is not offered to
 * it again, whichever of its units recorded it.
 *
 * A release lived only in the unit that recorded it. A reviewer that
 * opened a new unit was offered, one by one, every proposal it had given
 * back for a reason that still held (it had changed that code), and had
 * to release each again. Commits name no agent, so a release is read from
 * the refs that do: the reviewer's own review units here, its packs on the
 * remote, and the packs of its that the integration branch merged. A
 * release stands until the proposal's document changes after it.
 */
import { execFileSync } from 'node:child_process';

import { RELEASE_TRAILER } from '../../contracts/constants/review-command.constant';

interface IReviewBranches {
	readonly integration: string;
	readonly workRefPrefix: string;
	readonly publicationRefPrefix: string;
}

/** The output of a read-only git command, or nothing when it failed. */
const read = (cwd: string, args: readonly string[]): string => {
	try {
		return execFileSync('git', [...args], {
			cwd,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
		});
	} catch {
		return '';
	}
};

/** `refs/heads/delendai/wip/` and `delendai/wip/` name the same branches. */
const branchPath = (prefix: string): string =>
	prefix.replace(/^refs\//u, '').replace(/^heads\//u, '');

/** Each release in `range`, with the time it was recorded. */
const releasesIn = (
	cwd: string,
	range: readonly string[],
): { readonly id: string; readonly at: number }[] =>
	read(cwd, [
		'log',
		`--format=%ct%x09%(trailers:key=${RELEASE_TRAILER},valueonly,separator=%x2C)`,
		...range,
		'--',
	])
		.split('\n')
		.flatMap((line) => {
			const [at, ids] = line.split('\t');
			return (ids ?? '')
				.split(',')
				.map((id) => id.trim().toLowerCase())
				.filter((id) => id.length > 0)
				.map((id) => ({ id, at: Number(at) }));
		});

/** When the proposal's document last changed on the integration branch. */
const documentChangedAt = (
	cwd: string,
	integration: string,
	id: string,
): number => {
	const path = read(cwd, ['ls-tree', '-r', '--name-only', integration])
		.split('\n')
		.find((file) => (file.split('/').at(-1) ?? '').startsWith(`${id}-`));
	if (path === undefined) return 0;
	return Number(
		read(cwd, [
			'log',
			'-1',
			'--format=%ct',
			integration,
			'--',
			path,
		]).trim() || '0',
	);
};

/**
 * The proposals `agent` released in any of its review units, the one at
 * `cwd` included, and that have not changed since: never offered to it
 * again.
 */
export const releasedElsewhere = (
	cwd: string,
	agent: string,
	branches: IReviewBranches,
): readonly string[] => {
	const integration = ['refs/remotes/origin/', 'refs/heads/']
		.map((prefix) => `${prefix}${branches.integration}`)
		.find(
			(ref) =>
				read(cwd, ['rev-parse', '--verify', '--quiet', ref]).length > 0,
		);
	if (integration === undefined) return [];
	const own = [
		`refs/heads/${branchPath(branches.workRefPrefix)}${agent}/review/`,
		`refs/remotes/origin/${branchPath(branches.publicationRefPrefix)}${agent}/review/`,
	];
	const units = read(cwd, ['for-each-ref', '--format=%(refname)', ...own])
		.split('\n')
		.filter((ref) => ref.length > 0);
	const releases = ['HEAD', ...units].flatMap((ref) =>
		releasesIn(cwd, [ref, '--not', integration]),
	);
	// A pack that landed: its merge names its branch, its second parent
	// carries its releases.
	const packMark = `${branchPath(branches.publicationRefPrefix)}${agent}/review/`;
	for (const line of read(cwd, [
		'log',
		'--first-parent',
		'--merges',
		'--max-count=500',
		'--format=%H%x09%s',
		integration,
	]).split('\n')) {
		const [merge, subject] = line.split('\t');
		if (merge === undefined || subject?.includes(packMark) !== true)
			continue;
		releases.push(...releasesIn(cwd, [`${merge}^1..${merge}^2`]));
	}
	const latest = new Map<string, number>();
	for (const { id, at } of releases) {
		latest.set(id, Math.max(latest.get(id) ?? 0, at));
	}
	return [...latest]
		.filter(([id, at]) => documentChangedAt(cwd, integration, id) <= at)
		.map(([id]) => id);
};
