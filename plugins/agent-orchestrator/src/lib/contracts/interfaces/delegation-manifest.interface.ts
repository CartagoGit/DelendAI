import type { IDelegatedTask } from '@delendai/contracts';
import type { IArtifactStore, StateScope } from '@delendai/state';

import type { IPlanStep, ITask } from '../../policy/types.js';

/** One piece of context a delegated task may open, by its id. */
/** One item a source gives, or one it was asked for and could not. */
export type IDelegationItem =
	| { readonly id: string; readonly value: unknown }
	| { readonly id: string; readonly missing: string };

/**
 * Where a task's context comes from: the files it names, the facts memory
 * holds for the project, the effective configuration. A source that is
 * not loaded is simply not given.
 */
export interface IDelegationSource {
	readonly name: string;
	readonly items: (task: ITask) => Promise<readonly IDelegationItem[]>;
}

/** What compiling a step's manifest needs besides the task. */
export interface IDelegationManifestOptions {
	readonly store: IArtifactStore;
	readonly scope: StateScope;
	readonly sources: readonly IDelegationSource[];
	readonly contractHash: string;
	/** Input tokens a delegated step may take. */
	readonly inputBudget: number;
	readonly moreContext?: IDelegatedTask['moreContext'];
}

/** What a step is delegated with, compiled when it is about to run. */
export type IStepDelegate = (step: IPlanStep) => Promise<IDelegatedTask>;
