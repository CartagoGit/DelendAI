/**
 * publication-standings.service.ts — what `work status` and `work swarm`
 * say about open publications and orphaned work: how far behind each
 * publication is, what it shares with the others, its age, and whether
 * anybody is still on it (x01024).
 */
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type { ISwarmUnit } from '../contracts/interfaces/work-swarm.interface';
import type {
	IAuthorPresence,
	IOrphanedWork,
	IPublicationStanding,
} from '../contracts/interfaces/orphaned-work.interface';
import { orphanedUnits, publicationPresence } from './orphaned-work.service';
import { overlapsOf } from './work-swarm.service';

const SECONDS_PER_HOUR = 3600;

/**
 * How far behind each open publication is, how much it shares with the
 * others, how old it is and whether its owner is still there.
 */
export const publicationStandings = (input: {
	readonly published: readonly ISwarmUnit[];
	readonly presence: ReadonlyMap<string, IAuthorPresence>;
	readonly tipAt: (sha: string) => number | undefined;
	readonly now: number;
}): readonly IPublicationStanding[] => {
	const overlaps = overlapsOf(input.published);
	return input.published.map((unit) => {
		const at = input.tipAt(unit.tip);
		return {
			ref: unit.ref,
			behind: unit.behind,
			overlapping: overlaps.filter((overlap) =>
				overlap.refs.includes(unit.ref),
			).length,
			ageSeconds: at === undefined ? null : Math.max(0, input.now - at),
			ownerAlive: input.presence.get(unit.ref)?.orphaned !== true,
		};
	});
};

const hours = (seconds: number | null): string =>
	seconds === null
		? '?'
		: `${String(Math.round(seconds / SECONDS_PER_HOUR))}h`;

export const describePublicationStanding = (
	each: IPublicationStanding,
): string =>
	`publication      ${each.ref}: ${String(each.behind)} behind, ${String(each.overlapping)} overlapping file(s), age ${hours(each.ageSeconds)}, owner ${each.ownerAlive ? 'alive' : 'gone'}`;

/** One orphan as a person reads it: what, why, how long, and the way in. */
export const describeOrphan = (orphan: IOrphanedWork): string =>
	`orphaned         ${orphan.ref} (${orphan.agent}, ${orphan.reason}, last beat ${orphan.silentSeconds === null ? 'never' : `${hours(orphan.silentSeconds)} ago`}): take it with \`delendai work claim --ref=${orphan.ref}\``;

/** Every orphaned unit and publication of the clone. */
export const readOrphans = async (input: {
	readonly root: string;
	readonly policy: IResolvedDevelopmentPolicy;
	readonly published: readonly ISwarmUnit[];
	readonly standings: Parameters<typeof orphanedUnits>[0];
}): Promise<{
	readonly orphans: readonly IOrphanedWork[];
	readonly presence: ReadonlyMap<
		string,
		IAuthorPresence & { readonly agent: string }
	>;
}> => {
	const presence = await publicationPresence({
		root: input.root,
		policy: input.policy,
		publications: input.published.map((unit) => unit.ref),
		tips: new Map(input.published.map((unit) => [unit.ref, unit.tip])),
	});
	const published = [...presence.entries()].flatMap(
		([ref, judged]): IOrphanedWork[] =>
			judged.orphaned && judged.reason !== null
				? [{ ...judged, reason: judged.reason, ref }]
				: [],
	);
	return {
		orphans: [...orphanedUnits(input.standings), ...published],
		presence,
	};
};
