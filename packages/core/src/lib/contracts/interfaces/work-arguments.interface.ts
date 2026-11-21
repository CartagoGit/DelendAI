/** The work subcommands whose flags are checked before git is asked. */
export type IWorkArgumentsSubcommand =
	| 'enter'
	| 'checkpoint'
	| 'prove'
	| 'publish'
	| 'retire';

/** The flags a work subcommand cannot run without, and its refusal. */
export interface IWorkArgumentsRule {
	/** Flags whose absence no default fills. */
	readonly required: readonly string[];
	readonly reason: string;
	readonly usage: string;
}
