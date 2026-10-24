export interface IDrainResult {
	/** Lines the history stored as new samples. */
	readonly recorded: number;
	/** Lines refused by the history or unreadable. */
	readonly skipped: number;
}
