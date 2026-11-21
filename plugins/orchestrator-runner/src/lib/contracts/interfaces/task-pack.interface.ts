/**
 * task-pack.interface.ts — what a hop on another vendor is handed, and the
 * budget it is held to.
 */

/** Which rule set a hop's input budget. */
export type IHopBudgetRule =
	/** A share of the target model's context window, as the catalogue states it. */
	| 'model-window'
	/** The delegated task's own budget, smaller than the model's share or the only one known. */
	| 'task'
	/** Nothing bounds it: no window known and no task budget. */
	| 'none';

export interface IHopBudget {
	/** Input tokens the hop may take; `undefined` under rule `none`. */
	readonly tokens?: number | undefined;
	readonly rule: IHopBudgetRule;
}

/** How a hop's prompt was given, as its journal entry records it. */
export interface IHopDelegation {
	readonly kind: 'manifest' | 'instruction-only';
	/** The rendered prompt's size; the prompt itself is never journalled. */
	readonly promptBytes: number;
	readonly budget?: IHopBudget | undefined;
}
