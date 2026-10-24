/** What `work rescue` did with the shared checkout. */
export interface ISharedCheckoutRescue {
	/** `clean`: nothing to do. `rescued`: kept and restored. */
	readonly outcome: 'clean' | 'rescued' | 'refused';
	readonly paths: readonly string[];
	/** The ref that holds what was written, here and (when pushed) on the forge. */
	readonly keptAt?: string;
	readonly onForge?: boolean;
	readonly reason?: string;
	readonly restore?: string;
}
