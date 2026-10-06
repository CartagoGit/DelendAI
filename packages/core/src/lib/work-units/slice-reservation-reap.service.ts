/**
 * slice-reservation-reap.service.ts — a slice reservation whose unit is
 * gone from the forge is released, not left for the next entrant.
 *
 * A reservation is released when its unit is retired. A unit that lands
 * is not retired: its branches go, and its reservation stayed. It kept
 * nobody out — an entrant takes over one whose unit is gone — but every
 * delivered slice left a ref on the forge, for ever.
 */
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type { ISpentReservation } from '../contracts/interfaces/slice-reservation.interface';
import { abandonedAfterSeconds } from './forge-work-refs.service';
import { readGit } from './work-unit-shared.service';
import { namespacedRef } from './namespaced-ref.helper';

const bare = (prefix: string): string =>
	prefix.replace(/^refs\//u, '').replace(/^heads\//u, '');

/**
 * The slice reservations of `remote` whose unit has no branch there and
 * that are older than an abandoned unit is given, released when `apply`.
 * A forge that cannot be reached releases nothing. `now` is seconds
 * since the epoch.
 */
export const reapSpentReservations = (input: {
	readonly root: string;
	readonly policy: IResolvedDevelopmentPolicy;
	readonly remote: string;
	readonly apply: boolean;
	readonly now: number;
}): readonly ISpentReservation[] => {
	const { root, policy, remote } = input;
	const prefix = `${namespacedRef(policy.branches.namespacePrefix, 'claims', 'slice')}/`;
	const listed = readGit(root, [
		'ls-remote',
		remote,
		`${prefix}*`,
		'refs/heads/*',
	]);
	if (listed === undefined) return [];
	const refs = listed
		.split('\n')
		.filter((line) => line.length > 0)
		.map((line) => {
			const [commit = '', ref = ''] = line.split('\t');
			return { commit, ref };
		});
	const claims = refs.filter((each) => each.ref.startsWith(prefix));
	if (claims.length === 0) return [];
	const branches = new Set(
		refs
			.filter((each) => each.ref.startsWith('refs/heads/'))
			.map((each) => each.ref.slice('refs/heads/'.length)),
	);
	const unknown = claims.filter(
		(each) =>
			readGit(root, ['cat-file', '-e', `${each.commit}^{commit}`]) ===
			undefined,
	);
	if (unknown.length > 0) {
		readGit(root, [
			'fetch',
			'--quiet',
			'--no-tags',
			remote,
			...unknown.map((each) => each.commit),
		]);
	}
	const grace = abandonedAfterSeconds(policy.coordination.leaseTtlMinutes);
	const work = bare(policy.branches.workRefPrefix);
	const publication = bare(policy.branches.publicationRefPrefix);
	const spent = claims.flatMap((claim) => {
		const shown = readGit(root, [
			'log',
			'-1',
			'--format=%ct%n%B',
			claim.commit,
		]);
		// Not readable: nothing says its unit is gone.
		if (shown === undefined) return [];
		const [stamp = '0', ...body] = shown.split('\n');
		const unit =
			/^Unit: (?<unit>.+)$/mu.exec(body.join('\n'))?.groups?.unit ?? '';
		const held =
			branches.has(`${work}${unit}`) ||
			branches.has(`${publication}${unit}`) ||
			input.now - Number(stamp) <= grace;
		return held
			? []
			: [{ slice: claim.ref.slice(prefix.length), ref: claim.ref, unit }];
	});
	if (spent.length === 0) return [];
	if (!input.apply) {
		return spent.map((each) => ({ ...each, outcome: 'would-release' }));
	}
	const pushed = readGit(root, [
		'-c',
		'core.hooksPath=/dev/null',
		'push',
		'--quiet',
		remote,
		...spent.map((each) => `:${each.ref}`),
	]);
	return spent.map((each) => ({
		...each,
		outcome: pushed === undefined ? 'kept' : 'released',
	}));
};
