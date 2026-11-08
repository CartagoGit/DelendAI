/** What a test declares about how long its body may take. */
declare module 'vitest' {
	interface TaskMeta {
		/** The most the test body may take, in milliseconds. */
		budgetMs?: number;
	}
}

/** The migration list: spec files that may still hold tests with no budget. */
export interface ITimeBudgetMigration {
	/** Repository-relative paths, `/`-separated. Only ever shrinks. */
	readonly unbudgeted: readonly string[];
}

/** One test's measurement against what it declared. */
export interface ITimeBudgetCase {
	/** The test's own name, with or without its `[<Nms]` prefix. */
	readonly name: string;
	readonly meta: { readonly budgetMs?: number };
	/** Whether the test's file is on the migration list. */
	readonly migrating: boolean;
	/** How long the body took. */
	readonly tookMs: number;
}
