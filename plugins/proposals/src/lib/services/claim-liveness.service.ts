/**
 * claim-liveness.service.ts — a claim holds while its holder lives.
 *
 * A claim used to mean that a ref existed: a review unit's `Claims:`
 * commit kept its proposal held for as long as the unit's ref was
 * there. A ref outlives its agent (out of quota, crashed, context lost),
 * and after a swarm's agents had finished, sixteen slices still read as
 * held by others. Core already judges each unit from its lease (owner,
 * session, heartbeat; the last commit when no lease is visible here):
 * live, idle, abandoned or delivered. A claim now reads that verdict.
 *
 * It holds while its unit is live, or while its publication is open (what
 * it did can still land, and another reviewer must not duplicate it). A
 * unit gone quiet past its lease window holds nothing; its work is kept,
 * only the claim stops blocking. A ref core has no verdict for holds, the
 * cautious reading.
 */
import type { IUnitStandingEntry } from '@delendai/core/cli';
import type { IResolvedDevelopmentPolicy } from '@delendai/core/public';
import { readUnitStandings } from '@delendai/core/cli';

/** The unit's path from its agent on, the part every copy of its ref ends in. */
const unitPath = (ref: string): string =>
	ref.replace(/^refs\/(heads|remotes\/[^/]+)\//u, '');

/** Whether the unit at `ref` holds its claims, judged from `standings`. */
export const holdsFrom =
	(standings: readonly IUnitStandingEntry[]) =>
	(ref: string): boolean => {
		const path = unitPath(ref);
		const entry = standings.find(
			(each) =>
				each.ref === path ||
				path.endsWith(`/${each.ref}`) ||
				each.ref.endsWith(`/${path}`),
		);
		if (entry === undefined) return true;
		if (entry.publicationRef !== null) return true;
		return entry.standing === 'live';
	};

/** The predicate a claim reader asks, for the workspace at `root`. */
export const claimHolding = async (
	root: string,
	policy: IResolvedDevelopmentPolicy,
	now?: number,
): Promise<(ref: string) => boolean> =>
	holdsFrom(
		await readUnitStandings({
			root,
			policy,
			...(now === undefined ? {} : { now }),
		}),
	);
