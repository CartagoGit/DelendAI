/** The git hooks the development-policy guard is installed into. */
export type IGuardHookName =
	| 'pre-commit'
	| 'reference-transaction'
	| 'pre-push'
	| 'post-checkout'
	| 'post-merge';

/** How a hook reaches `delendai guard`: a runner and the CLI entry it runs. */
export interface IGuardInvocation {
	/** Executable on PATH, e.g. `bun` or `node`. */
	readonly runner: string;
	/** Absolute path of the delendai CLI entry. */
	readonly entry: string;
}

/** What installing the guard does to one hook file. */
export type IGuardHookEdit =
	| {
			readonly hook: IGuardHookName;
			readonly action: 'create';
			readonly content: string;
	  }
	| {
			readonly hook: IGuardHookName;
			readonly action: 'update';
			readonly content: string;
	  }
	| { readonly hook: IGuardHookName; readonly action: 'unchanged' }
	| {
			readonly hook: IGuardHookName;
			readonly action: 'unsupported';
			readonly reason: string;
	  };
