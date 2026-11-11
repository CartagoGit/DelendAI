/** A schema issue as zod reports it: where, and what is wrong. */
export interface IArgumentIssue {
	readonly path: readonly PropertyKey[];
	readonly message: string;
}
