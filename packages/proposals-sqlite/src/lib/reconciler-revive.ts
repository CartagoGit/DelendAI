/**
 * reconciler-revive.ts
 *
 * A file that returns is alive again.
 *
 * A disappearance is recorded twice: a row in `tombstones` and
 * `deleted_at` on the entity. Every later candidate inherits the record,
 * so it was applied again on each promotion, including the ones whose
 * candidate carried the entity itself. A proposal removed in one commit
 * and present in a later one therefore stayed retired for good, and
 * every reader that lists what exists now left it out. The candidate is
 * what the markdown holds: an entity in it exists, whatever was observed
 * before.
 */
import type { Database } from 'bun:sqlite';

/** The tables a tombstone can refer to, by the entity type it names. */
const TABLE_OF = {
	proposal: 'proposals',
	plan: 'plans',
	slice: 'slices',
} as const;

type TEntityType = keyof typeof TABLE_OF;

/** The uids a candidate carries, per entity type. */
type ILiveEntities = Readonly<Record<TEntityType, ReadonlySet<string>>>;

const isEntityType = (value: string): value is TEntityType =>
	Object.hasOwn(TABLE_OF, value);

const unretiredIn = (candidate: Database, type: TEntityType): Set<string> =>
	new Set(
		candidate
			.query<{ readonly uid: string }, []>(
				`SELECT uid FROM ${TABLE_OF[type]} WHERE deleted_at IS NULL`,
			)
			.all()
			.map((row) => row.uid),
	);

/**
 * What a candidate holds as existing. It also carries the entities the
 * run found gone, marked retired, and those are not alive.
 */
export const readLiveEntities = (candidate: Database): ILiveEntities => ({
	proposal: unretiredIn(candidate, 'proposal'),
	plan: unretiredIn(candidate, 'plan'),
	slice: unretiredIn(candidate, 'slice'),
});

/** Whether a recorded disappearance names an entity the candidate carries. */
export const isContradictedByCandidate = (
	stone: { readonly entity_type: string; readonly entity_uid: string },
	live: ILiveEntities,
): boolean =>
	isEntityType(stone.entity_type) &&
	live[stone.entity_type].has(stone.entity_uid);

/**
 * Clear the retirement of every entity the candidate carries, on the
 * entity and in `tombstones`, so the next candidate does not inherit it.
 * Returns how many entities came back.
 */
export const reviveReturnedEntities = (
	handle: Database,
	live: ILiveEntities,
): number => {
	let revived = 0;
	for (const type of Object.keys(TABLE_OF).filter(isEntityType)) {
		const table = TABLE_OF[type];
		const retired = handle
			.query<{ readonly uid: string }, []>(
				`SELECT uid FROM ${table} WHERE deleted_at IS NOT NULL`,
			)
			.all();
		for (const { uid } of retired) {
			if (!live[type].has(uid)) continue;
			handle
				.prepare(
					`UPDATE ${table}
					 SET deleted_at = NULL, tombstone_reason = NULL
					 WHERE uid = ?`,
				)
				.run(uid);
			revived += 1;
		}
		for (const uid of live[type]) {
			handle
				.prepare(
					'DELETE FROM tombstones WHERE entity_type = ? AND entity_uid = ?',
				)
				.run(type, uid);
		}
	}
	return revived;
};
