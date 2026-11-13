import type { IAutoWorkPersistMode } from '../../tools/auto-work-persist';

/**
 * Which component actually commits a finished slice.
 *
 * `proposals` and `commit-policy` are agnostic of each other and only
 * agree on one thing: exactly one of them persists a slice. `'nobody'`
 * is the third, legitimate-but-usually-accidental case — see
 * `slice-persistence-owner.ts` for why naming it matters.
 */
export type ISlicePersistenceOwner = 'commit-policy' | 'proposals' | 'nobody';

export interface ISlicePersistenceResolution {
	readonly mode: IAutoWorkPersistMode;
	readonly owner: ISlicePersistenceOwner;
	/** Operator-facing lines. Empty unless nobody owns persistence. */
	readonly lines: readonly string[];
}
