/** One observation about a unit of work, as the caller states it. */
export interface IWorkEventJournalEntry {
	/** One of the work event bus's closed kinds; the private reader drops others. */
	readonly kind: string;
	readonly proposal: string;
	readonly slice: string;
	readonly actor: string | null;
	/** Small, secret-free facts; only their hash is journalled. */
	readonly detail?: Readonly<Record<string, string>> | undefined;
}

/** One line of the journal: the shape the work event bus stores. */
export interface IWorkEventJournalLine {
	readonly work_item_id: string;
	readonly actor_id: string | null;
	/** One of the work event bus's closed kinds; the private reader drops others. */
	readonly kind: string;
	readonly payload_hash: string;
	readonly created_at: number;
}
