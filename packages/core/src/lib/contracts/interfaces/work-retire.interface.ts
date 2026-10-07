/**
 * work-retire.interface.ts — what retiring a unit of work keeps and
 * removes.
 */

/** The names one unit goes by, and where its tip is kept once retired. */
export interface IRetirementPlan {
	/** The unit's name without its namespace: `<agent>/<kind>/<…>`. */
	readonly unit: string;
	/** The unit's branch as a work ref, `<work prefix><unit>`. */
	readonly workBranch: string;
	/** The unit's branch as a publication, `<publication prefix><unit>`. */
	readonly publicationBranch: string;
	/** The hidden ref that keeps the work, `refs/<namespace>/retired/<unit>`. */
	readonly retiredRef: string;
}

/** What retiring a unit did, for the caller to read. */
export interface IRetirementOutcome {
	readonly unit: string;
	readonly reason: string;
	/** Each ref that now keeps the work, with the commit it holds. */
	readonly kept: readonly { readonly ref: string; readonly commit: string }[];
	/** The branches removed, on the forge and here. */
	readonly removed: readonly string[];
	/** The pull requests closed, by number. */
	readonly closed: readonly number[];
	/** How to bring the work back. */
	readonly restore: string;
}

/** What `work reap` did, or would do, with one retired ref. */
export interface ILandedRetired {
	readonly unit: string;
	readonly ref: string;
	readonly commit: string;
	readonly outcome: 'dropped' | 'would-drop' | 'kept';
}
