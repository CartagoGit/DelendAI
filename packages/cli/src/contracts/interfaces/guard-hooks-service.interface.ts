import type { IGuardHookName } from '@delendai/core/cli';

/** Where a project's hooks live, and who manages them. */
export interface IHooksLocation {
	/** Absolute hooks directory git actually runs. */
	readonly dir: string;
	/** A hook manager that rewrites hook files, when one is detected. */
	readonly manager?: 'lefthook' | 'husky-v9' | undefined;
}

/** The outcome of installing, removing or inspecting the guard. */
export interface IGuardHooksReport {
	readonly dir: string;
	readonly hooks: ReadonlyArray<{
		readonly hook: IGuardHookName;
		readonly state:
			| 'created'
			| 'updated'
			| 'unchanged'
			| 'removed'
			| 'installed'
			| 'absent'
			| 'unsupported';
		readonly reason?: string;
	}>;
}
