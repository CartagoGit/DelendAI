/**
 * Contract shapes for `./ids`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `ids.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `ids.ts`, so no import site changes.
 */

/** The forge-side identity of a repository. */
export interface IRepositoryKey {
	readonly forge: string;
	readonly owner: string;
	readonly name: string;
}

/** The identifying content of a coordination journal event. */
export interface IJournalEventIdentity {
	readonly eventKind: string;
	readonly repositoryUid?: string | undefined;
	readonly workUnitUid?: string | undefined;
	readonly generation?: number | undefined;
	readonly actorAgentId?: string | undefined;
	readonly occurredAt: number;
	/** Canonical JSON payload — already serialised by the caller. */
	readonly payloadJson: string;
}
