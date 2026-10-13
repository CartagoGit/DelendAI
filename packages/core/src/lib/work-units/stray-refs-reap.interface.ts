/**
 * A ref outside every namespace a clone holds, and what the reaper did
 * with it. `kept`: it may hold work, so a person decides.
 */
export interface IReapedStrayRef {
	readonly ref: string;
	readonly outcome: 'removed' | 'would-remove' | 'kept';
}
