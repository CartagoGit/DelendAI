/** The verdict on one finished shell command. */
export interface IShellRescueVerdict {
	/** `none`: nothing to say. `rescued`/`refused`: tell the agent. */
	readonly outcome: 'none' | 'rescued' | 'refused';
	readonly message?: string;
}
