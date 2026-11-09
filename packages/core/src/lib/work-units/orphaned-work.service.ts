/**
 * orphaned-work.service.ts — work whose author is gone is said to be so,
 * offered to anyone, and kept moving.
 *
 * The queue hands a red pull request back to its author ("its author
 * pushes next") and nothing else touches it. That is right while the
 * author is there, and a dead end when the author finished, went quiet
 * past the recovery window or ran out of quota: the candidate stayed red
 * for good and nobody was told. The author's presence is judged here, once,
 * from the one evidence every project has: the unit's lease (its heartbeat
 * and the session holding it) and, for a unit with no lease, its own last
 * commit. `work status`, `work swarm` and the queue's hydrator all read it.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { shortName } from '../integration/decisions/namespaces.helper';
import { DEFAULT_CACHE_DIR } from '../contracts/constants/delendai-records.constant';
import {
	ORPHAN_RESCUE_ATTEMPTS,
	ORPHAN_RESCUES_FILE,
} from '../contracts/constants/orphaned-work.constant';
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type {
	IAuthorEvidence,
	IAuthorPresence,
	IOrphanedWork,
	IOrphanRescues,
	IOrphanRescueStep,
} from '../contracts/interfaces/orphaned-work.interface';
import { writeFileAtomic } from '../shared/atomic-write';
import {
	ABANDONED_AFTER_LEASE_WINDOWS,
	SECONDS_PER_MINUTE,
} from './unit-lease.constant';
import type { IUnitLease, IUnitStandingEntry } from './unit-lease.interface';
import { listUnitLeases } from './unit-lease.store';
import { gitCommonDirOf } from './unit-lease.service';
import { ownActivityAt } from './unit-activity.helper';
import { leaseWindowSeconds } from './unit-verdict.service';
import { unitLifeReader } from './unit-liveness.service';
import { identityOf, listWorkRefs } from './work-swarm.service';
import { integrationBase, readGit } from './work-unit-shared.service';

const minutes = (seconds: number): string =>
	`${String(Math.max(0, Math.round(seconds / SECONDS_PER_MINUTE)))} min`;

/**
 * Whether the author is gone. Alive is a heartbeat inside the lease window
 * from a session that has not said it ran out of quota; everything else
 * is judged by why nobody is there.
 */
export const judgeAuthor = (evidence: IAuthorEvidence): IAuthorPresence => {
	const { lease, now, windowSeconds } = evidence;
	// A unit that ended by delivering its work is not abandoned: the work is
	// in a publication waiting for its pull request, which nobody needs the
	// author for until the pull request is red. Past the recovery window
	// nothing waits any longer, and the usual judgement follows.
	if (evidence.unitEnded && evidence.deliveredAt !== undefined) {
		const waiting = Math.max(0, now - evidence.deliveredAt);
		const recoverySeconds = windowSeconds * ABANDONED_AFTER_LEASE_WINDOWS;
		if (waiting <= recoverySeconds) {
			return {
				orphaned: false,
				reason: null,
				silentSeconds: waiting,
				why: `delivered ${minutes(waiting)} ago and waiting for its pull request, inside the ${minutes(recoverySeconds)} recovery window`,
			};
		}
	}
	// An ended unit has no commit of its own to come: only a lease says
	// somebody is on it again.
	const beat =
		lease?.heartbeatAt ?? (evidence.unitEnded ? undefined : evidence.tipAt);
	const silentSeconds = beat === undefined ? null : Math.max(0, now - beat);
	const quota = lease?.outOfQuotaAt;
	if (quota !== undefined && beat !== undefined && quota >= beat) {
		return {
			orphaned: true,
			reason: 'out-of-quota',
			silentSeconds,
			why: `the session of ${lease?.owner.agent ?? 'its owner'} ran out of quota and has shown no life since`,
		};
	}
	if (silentSeconds !== null && silentSeconds <= windowSeconds) {
		return {
			orphaned: false,
			reason: null,
			silentSeconds,
			why: `its author beat ${minutes(silentSeconds)} ago, inside the ${minutes(windowSeconds)} window`,
		};
	}
	if (evidence.unitEnded) {
		return {
			orphaned: true,
			reason: 'finished',
			silentSeconds,
			why: 'its unit ended and no live session holds its lease',
		};
	}
	const recovery = windowSeconds * ABANDONED_AFTER_LEASE_WINDOWS;
	if (silentSeconds !== null && silentSeconds > recovery) {
		return {
			orphaned: true,
			reason: 'idle-past-window',
			silentSeconds,
			why: `silent ${minutes(silentSeconds)}, past the ${minutes(recovery)} recovery window`,
		};
	}
	return {
		orphaned: false,
		reason: null,
		silentSeconds,
		why:
			silentSeconds === null
				? 'no beat to date it from: not judged gone without evidence'
				: `quiet ${minutes(silentSeconds)}, inside the ${minutes(recovery)} recovery window`,
	};
};

/**
 * The units whose author is gone. Delivered ones are not: their work is
 * in a publication, which is judged on its own; and a unit waiting on
 * someone is quiet on purpose.
 */
export const orphanedUnits = (
	entries: readonly IUnitStandingEntry[],
): readonly IOrphanedWork[] =>
	entries.flatMap((entry) =>
		entry.author?.orphaned === true &&
		entry.author.reason !== null &&
		entry.standing !== 'delivered' &&
		entry.standing !== 'waiting'
			? [
					{
						...entry.author,
						reason: entry.author.reason,
						ref: entry.ref,
						agent: entry.owner?.agent ?? 'unknown',
					},
				]
			: [],
	);

/** The work ref a publication ref was published from. */
export const workRefOfPublication = (
	policy: IResolvedDevelopmentPolicy,
	publication: string,
): string | undefined => {
	const published = shortName(policy.branches.publicationRefPrefix);
	const work = shortName(policy.branches.workRefPrefix);
	const bare = shortName(publication);
	if (published.length === 0 || work.length === 0) return undefined;
	return bare.startsWith(published)
		? `${work}${bare.slice(published.length)}`
		: undefined;
};

/** The lease that took the unit over, when somebody claimed it. */
const adopterOf = (
	leases: ReadonlyMap<string, IUnitLease>,
	workRef: string,
): IUnitLease | undefined =>
	[...leases.values()].find((lease) =>
		(lease.handedFrom ?? []).some((hand) => hand.ref === workRef),
	);

/**
 * Whether each publication's author is still on it, keyed by the
 * publication's short name. A unit claimed by another agent is judged by
 * its new holder: an adopted candidate is no orphan.
 */
export const publicationPresence = async (input: {
	readonly root: string;
	readonly policy: IResolvedDevelopmentPolicy;
	readonly publications: readonly string[];
	/**
	 * The tip of each publication by short name. Given, a publication whose
	 * unit ended by delivering it is dated from its own tip.
	 */
	readonly tips?: ReadonlyMap<string, string> | undefined;
	readonly now?: number | undefined;
}): Promise<
	ReadonlyMap<string, IAuthorPresence & { readonly agent: string }>
> => {
	const { root, policy } = input;
	const now = input.now ?? Math.floor(Date.now() / 1000);
	const common = gitCommonDirOf(root);
	const leases =
		common === undefined
			? new Map<string, IUnitLease>()
			: await listUnitLeases(common);
	const refs = listWorkRefs(root, policy);
	const integration =
		integrationBase(root, policy) ?? policy.branches.integration;
	const windowSeconds = leaseWindowSeconds(
		policy.coordination.leaseTtlMinutes,
	);
	// An author still on the unit is no orphan, whatever its lease says.
	const lifeOf = unitLifeReader({ root, policy, now });
	const presence = new Map<
		string,
		IAuthorPresence & { readonly agent: string }
	>();
	for (const publication of input.publications) {
		const name = shortName(publication);
		const workRef = workRefOfPublication(policy, name);
		if (workRef === undefined) continue;
		const adopter = adopterOf(leases, workRef);
		const lease = adopter ?? leases.get(workRef);
		const sha = refs.get(workRef);
		const tipAt =
			sha === undefined
				? undefined
				: ownActivityAt(
						(args) => readGit(root, args) ?? '',
						sha,
						integration,
					);
		const unitEnded = sha === undefined && adopter === undefined;
		const published = input.tips?.get(name);
		const deliveredAt =
			unitEnded && published !== undefined
				? ownActivityAt(
						(args) => readGit(root, args) ?? '',
						published,
						integration,
					)
				: undefined;
		const judged = judgeAuthor({
			lease,
			tipAt,
			...(deliveredAt === undefined ? {} : { deliveredAt }),
			unitEnded,
			now,
			windowSeconds,
		});
		const life = judged.orphaned
			? await lifeOf({ ref: lease?.ref ?? workRef, lease })
			: undefined;
		presence.set(name, {
			...(life?.alive === true
				? { ...judged, orphaned: false, reason: null, why: life.why }
				: judged),
			agent:
				lease?.owner.agent ??
				identityOf(name, policy, policy.branches.publicationRefPrefix)
					.agent,
		});
	}
	return presence;
};

/** The file under a workspace's cache where the hydrator counts. */
export const orphanRescuesPath = (root: string): string =>
	join(root, DEFAULT_CACHE_DIR, ORPHAN_RESCUES_FILE);

export const readOrphanRescues = async (
	root: string,
): Promise<IOrphanRescues> => {
	try {
		const parsed = JSON.parse(
			await readFile(orphanRescuesPath(root), 'utf8'),
		) as Partial<IOrphanRescues>;
		return { rescues: parsed.rescues ?? {} };
	} catch {
		return { rescues: {} };
	}
};

export const writeOrphanRescues = (
	root: string,
	record: IOrphanRescues,
): Promise<void> =>
	writeFileAtomic(
		orphanRescuesPath(root),
		`${JSON.stringify(record, null, '\t')}\n`,
	);

/**
 * What the hydrator does to each orphaned red candidate on this pass, and
 * the count it keeps. Red now means the attempt before failed. Below the
 * bound one that is behind is brought forward again, and one nothing moved
 * under waits without spending an attempt; at the bound the owner is told
 * once, and after that it is left alone. Nothing here deletes: the tip
 * stays where it is, for whoever adopts it. A candidate that is no longer
 * orphaned (adopted, or its author came back) drops out of the count.
 */
export const planOrphanRescues = (input: {
	readonly orphaned: readonly {
		readonly headRef: string;
		readonly behind: boolean;
	}[];
	readonly rescues: IOrphanRescues;
	readonly limit?: number | undefined;
	readonly now?: Date | undefined;
}): {
	readonly steps: ReadonlyMap<string, IOrphanRescueStep>;
	readonly next: IOrphanRescues;
} => {
	const limit = input.limit ?? ORPHAN_RESCUE_ATTEMPTS;
	const at = (input.now ?? new Date()).toISOString();
	const steps = new Map<string, IOrphanRescueStep>();
	const rescues: Record<string, IOrphanRescues['rescues'][string]> = {};
	for (const { headRef, behind } of input.orphaned) {
		const current = input.rescues.rescues[headRef] ?? { attempts: 0 };
		if (current.reportedAt !== undefined) {
			steps.set(headRef, 'left');
			rescues[headRef] = current;
		} else if (current.attempts >= limit) {
			steps.set(headRef, 'report');
			rescues[headRef] = { ...current, reportedAt: at };
		} else if (behind) {
			steps.set(headRef, 'bring-forward');
			rescues[headRef] = { attempts: current.attempts + 1 };
		} else {
			steps.set(headRef, 'wait');
			rescues[headRef] = current;
		}
	}
	return { steps, next: { rescues } };
};

/** The orphans the hydrator gave up on, so `work status` tells the owner. */
export const reportedOrphans = async (
	root: string,
): Promise<
	readonly {
		readonly headRef: string;
		readonly attempts: number;
		readonly reportedAt: string;
	}[]
> =>
	Object.entries((await readOrphanRescues(root)).rescues).flatMap(
		([headRef, rescue]) =>
			rescue.reportedAt === undefined
				? []
				: [
						{
							headRef,
							attempts: rescue.attempts,
							reportedAt: rescue.reportedAt,
						},
					],
	);
