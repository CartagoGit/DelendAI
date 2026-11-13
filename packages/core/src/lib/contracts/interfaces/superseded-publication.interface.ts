/** What happened to one publication a claim superseded. */
export interface ISupersession {
	readonly publication: string;
	readonly retired: boolean;
	readonly reason: string;
}

/** What the supersession asks of git and of the retire command. */
export interface ISupersessionPorts {
	/** Git's trimmed output, or `undefined` when it failed. */
	readonly git: (args: readonly string[]) => string | undefined;
	/** Retire a publication; the refusal text, or undefined when it was retired. */
	readonly retire: (
		publication: string,
		reason: string,
	) => Promise<string | undefined>;
}
