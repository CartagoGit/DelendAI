/** What the capability resolver answers. */

/** One resolver reply: the tool's result, or why it could not be reached. */
export interface IResolvedCapability {
	/** `ok` when the tool ran; anything else is a refusal. */
	readonly status: string;
	/** The refusal's vocabulary term, when it refused. */
	readonly reason?: string;
	/** What the refusal says in words. */
	readonly detail?: string;
	/** The tool's own result, as the protocol carries it. */
	readonly result?: {
		readonly content?: readonly { readonly text?: string }[];
	};
}
