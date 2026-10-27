/**
 * Contract shapes for `./mutation-commands-repo`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: the repository module
 * keeps the behaviour, this file keeps the shapes. Every name here is
 * re-exported from `mutation-commands-repo.ts`, so no import site
 * changes — the same split `revision-cas.interface.ts` already makes
 * next door.
 */

/** The three projected entities a lifecycle command can address. */
export type IMutationCommandEntityType = 'proposal' | 'plan' | 'slice';

/** One receipt row: the command, who ran it, and what it decided. */
export interface IMutationCommandRecord {
	readonly id: number;
	readonly commandName: string;
	readonly idempotencyKey: string;
	readonly requestFingerprint: string;
	readonly entityType: IMutationCommandEntityType;
	readonly entityUid: string;
	readonly revisionBefore: number | null;
	readonly revisionAfter: number | null;
	readonly outcomeKind: string | null;
	readonly responseJson: string | null;
	readonly status: 'started' | 'completed' | 'failed';
	readonly actor: string | null;
	readonly source: string | null;
	readonly createdAt: number;
	readonly completedAt: number | null;
}

export interface IClaimMutationCommandArgs {
	readonly commandName: string;
	readonly idempotencyKey: string;
	readonly requestFingerprint: string;
	readonly entityType: IMutationCommandEntityType;
	readonly entityUid: string;
	readonly revisionBefore?: number | null;
	readonly actor?: string;
	readonly source?: string;
	readonly now?: number;
}

export interface ICompleteMutationCommandArgs {
	readonly id: number;
	readonly revisionAfter?: number | null;
	readonly outcomeKind: string;
	readonly responseJson: string;
	readonly failed?: boolean;
	readonly now?: number;
}

/**
 * Completing a receipt the caller knows only by its command key.
 *
 * A process that restarts between claiming and completing no longer
 * holds the row id, but it still holds the key it claimed with.
 */
export interface ICompleteMutationCommandByKeyArgs
	extends Omit<ICompleteMutationCommandArgs, 'id'> {
	readonly commandName: string;
	readonly idempotencyKey: string;
}

/** What a caller supplies to address a receipt for one command. */
export interface IMutationCommandIdentityInput {
	readonly commandName: string;
	readonly entityType: IMutationCommandEntityType;
	readonly entityUid: string;
	readonly targetStatus: string;
	readonly expectedRevision?: number;
	readonly idempotencyKey?: string;
	readonly requestFingerprint?: string;
}

/** The resolved pair that addresses one receipt. */
export interface IMutationCommandIdentity {
	readonly idempotencyKey: string;
	readonly requestFingerprint: string;
}
