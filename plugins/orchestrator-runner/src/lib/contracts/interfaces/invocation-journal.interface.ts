/**
 * invocation-journal.interface.ts — what became of each invocation,
 * written as it happens so a restart can tell.
 */

/**
 * `running` until a hop ends; `completed` only when the provider's
 * process ended without error — never a claim that the task's
 * postconditions hold; `interrupted` when the process that ran it died
 * before writing its end.
 */
export type IInvocationState =
	| 'running'
	| 'completed'
	| 'failed'
	| 'blocked'
	| 'interrupted';

export interface IInvocationJournalEntry {
	readonly invocationId: string;
	readonly at: string;
	readonly state: IInvocationState;
	readonly providerId: string;
	readonly accountId?: string;
	/** Why it failed or was blocked; never a secret (redacted on write). */
	readonly detail?: string;
	/** The process that wrote the entry, to tell a dead one's runs. */
	readonly pid: number;
}

/** Writes one entry; a failed write never fails the invocation. */
export type IInvocationJournal = (
	entry: Omit<IInvocationJournalEntry, 'at' | 'pid'>,
) => Promise<void>;
