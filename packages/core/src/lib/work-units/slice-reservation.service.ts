/**
 * slice-reservation.service.ts — one unit implements a slice, and the
 * forge is where that is decided.
 *
 * The held-slice refusal reads the refs a clone has. Two machines entering
 * one slice in the same minute each fetched before the other pushed, each
 * saw the slice free, and both built it: a slice went out under three
 * generations at once, and each cost a pull request and a CI run for work
 * another unit was already doing.
 *
 * Entering a slice to implement it first creates a ref on the forge with a
 * push only one of two can win. The commit it points at names the unit. A
 * reservation holds while its unit is on the forge, or for the time a
 * silent unit is given when it has not been pushed yet; after that the
 * next agent takes it over.
 */
import { randomUUID } from 'node:crypto';

import type { ISliceReservation } from '../contracts/interfaces/slice-reservation.interface';
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type { IWorkUnitResult } from '../contracts/interfaces/work-unit-context.interface';
import { abandonedAfterSeconds } from './forge-work-refs.service';
import {
	integrationRemote,
	readGit,
	refused,
} from './work-unit-shared.service';
import { namespacedRef } from './namespaced-ref.helper';

/** The slice that holds every other slice of its proposal. */
const WHOLE_PROPOSAL = 'all';

const covers = (left: string, right: string): boolean =>
	left === right || left === WHOLE_PROPOSAL || right === WHOLE_PROPOSAL;

const holderOf = (
	message: string,
): { readonly unit: string; readonly agent: string } => ({
	unit: /^Unit: (?<unit>.+)$/mu.exec(message)?.groups?.unit ?? '',
	agent: /^Agent: (?<agent>.+)$/mu.exec(message)?.groups?.agent ?? '',
});

/** Where the reservations of a proposal's slices live. */
export const sliceReservationPrefix = (
	namespace: string,
	proposal: string,
): string =>
	`${namespacedRef(namespace, 'claims', 'slice', proposal.toLowerCase())}/`;

/**
 * Reserve `slice` of `proposal` for the unit `unit`. `unitBranches` are
 * the branches the unit goes by on the forge (its work ref and its
 * publication): a reservation whose unit has neither, and is older than
 * `graceSeconds`, belongs to nobody.
 */
export const reserveSlice = (input: {
	readonly root: string;
	readonly remote: string;
	readonly namespace: string;
	readonly proposal: string;
	readonly slice: string;
	readonly unit: string;
	readonly agent: string;
	readonly graceSeconds: number;
	/** The forge branches a unit of that name goes by. */
	readonly branchesOf: (unit: string) => readonly string[];
	readonly now?: number | undefined;
}): ISliceReservation => {
	const { root } = input;
	const url = readGit(root, ['remote', 'get-url', input.remote]);
	const tree = readGit(root, ['rev-parse', 'HEAD^{tree}']);
	if (url === undefined || tree === undefined) return { kind: 'unavailable' };
	const prefix = sliceReservationPrefix(input.namespace, input.proposal);
	const listed = readGit(root, ['ls-remote', '--', url, `${prefix}*`]);
	if (listed === undefined) return { kind: 'unavailable' };
	const now = input.now ?? Math.floor(Date.now() / 1000);
	const stale: { ref: string; commit: string }[] = [];
	for (const line of listed.split('\n').filter((each) => each.length > 0)) {
		const [commit = '', ref = ''] = line.split('\t');
		const slice = ref.slice(prefix.length);
		if (!covers(slice, input.slice.toLowerCase())) continue;
		if (readGit(root, ['fetch', '--quiet', '--', url, ref]) === undefined) {
			return { kind: 'unavailable' };
		}
		const shown = readGit(root, ['log', '-1', '--format=%ct%n%B', commit]);
		if (shown === undefined) return { kind: 'unavailable' };
		const [stamp = '0', ...body] = shown.split('\n');
		const holder = holderOf(body.join('\n'));
		if (holder.unit === input.unit) {
			stale.push({ ref, commit });
			continue;
		}
		const onForge = input
			.branchesOf(holder.unit)
			.some(
				(branch) =>
					(
						readGit(root, [
							'ls-remote',
							'--',
							url,
							`refs/heads/${branch}`,
						]) ?? ''
					).length > 0,
			);
		if (onForge || now - Number(stamp) <= input.graceSeconds) {
			return { kind: 'taken', ...holder, slice };
		}
		stale.push({ ref, commit });
	}
	// A commit of its own each time: two units pushing one object to one
	// ref would both be told "up to date".
	const mine = readGit(root, [
		'-c',
		'user.name=delendai',
		'-c',
		'user.email=delendai@localhost',
		'commit-tree',
		tree,
		'-m',
		`slice claim ${input.proposal} ${input.slice} ${randomUUID()}\n\nUnit: ${input.unit}\nAgent: ${input.agent}`,
	]);
	if (mine === undefined) return { kind: 'unavailable' };
	const ref = `${prefix}${input.slice.toLowerCase()}`;
	const own = stale.find((each) => each.ref === ref);
	// Replace exactly what was read; create only where nothing was.
	const pushed =
		own === undefined
			? readGit(root, ['send-pack', url, `${mine}:${ref}`])
			: readGit(root, [
					'-c',
					'core.hooksPath=/dev/null',
					'push',
					'--quiet',
					'--',
					`--force-with-lease=${ref}:${own.commit}`,
					'--',
					url,
					`${mine}:${ref}`,
				]);
	if (pushed !== undefined) return { kind: 'reserved' };
	// Lost the push to somebody who reserved at the same moment.
	const winner = readGit(root, ['ls-remote', '--', url, ref]) ?? '';
	const commit = winner.split('\t')[0] ?? '';
	if (commit.length === 0) return { kind: 'unavailable' };
	readGit(root, ['fetch', '--quiet', '--', url, ref]);
	const holder = holderOf(
		readGit(root, ['log', '-1', '--format=%B', commit]) ?? '',
	);
	return { kind: 'taken', ...holder, slice: input.slice };
};

/** Give a unit's reservations of a proposal back, when it ends. */
export const releaseSlices = (input: {
	readonly root: string;
	readonly remote: string;
	readonly namespace: string;
	readonly proposal: string;
	readonly unit: string;
}): number => {
	const { root } = input;
	const url = readGit(root, ['remote', 'get-url', input.remote]);
	if (url === undefined) return 0;
	const prefix = sliceReservationPrefix(input.namespace, input.proposal);
	const listed = readGit(root, ['ls-remote', '--', url, `${prefix}*`]) ?? '';
	let released = 0;
	for (const line of listed.split('\n').filter((each) => each.length > 0)) {
		const [commit = '', ref = ''] = line.split('\t');
		if (readGit(root, ['fetch', '--quiet', '--', url, ref]) === undefined)
			continue;
		const holder = holderOf(
			readGit(root, ['log', '-1', '--format=%B', commit]) ?? '',
		);
		if (holder.unit !== input.unit) continue;
		if (
			readGit(root, [
				'-c',
				'core.hooksPath=/dev/null',
				'push',
				'--quiet',
				'--',
				`--force-with-lease=${ref}:${commit}`,
				'--',
				url,
				`:${ref}`,
			]) !== undefined
		) {
			released += 1;
		}
	}
	return released;
};

/** The namespace prefix as it appears in a branch name. */
const bare = (prefix: string): string =>
	prefix.replace(/^refs\//u, '').replace(/^heads\//u, '');

/**
 * The refusal a new implementation unit gets when another unit holds its
 * slice on the forge, or `undefined`: reserved, or no forge to ask.
 */
export const sliceHeldOnForge = (input: {
	readonly root: string;
	readonly policy: IResolvedDevelopmentPolicy;
	readonly proposal: string;
	readonly slice: string;
	readonly agent: string;
	/** The new unit's branch, without `refs/heads/`. */
	readonly branch: string;
}): IWorkUnitResult | undefined => {
	const { root, policy } = input;
	const work = bare(policy.branches.workRefPrefix);
	const publication = bare(policy.branches.publicationRefPrefix);
	const reservation = reserveSlice({
		root,
		remote: integrationRemote(root, policy),
		namespace: policy.branches.namespacePrefix,
		proposal: input.proposal,
		slice: input.slice,
		unit: input.branch.slice(work.length),
		agent: input.agent,
		graceSeconds: abandonedAfterSeconds(
			policy.coordination.leaseTtlMinutes,
		),
		branchesOf: (unit) => [`${work}${unit}`, `${publication}${unit}`],
	});
	return reservation.kind === 'taken'
		? refused(
				`${input.proposal} ${reservation.slice} is reserved on the forge by ${reservation.agent}: two units on one slice do the same work twice and collide when they land.`,
				`Its unit is \`${reservation.unit}\`. Wait for it to land, take a slice nobody holds, or pass --alongside for a deliberate second attempt.`,
			)
		: undefined;
};
