/** Where a dirty path of the shared checkout stands against the work refs. */
export interface IDirtyPathsReport {
	/** Every path git reports as changed in the working tree. */
	readonly dirty: readonly string[];
	/**
	 * Dirty paths whose current content no work ref holds: lost if the
	 * checkout is cleaned, invisible to every other agent.
	 */
	readonly undurable: readonly string[];
}

/** One work ref as far as durability is concerned. */
export interface IDurabilityRef {
	readonly tip: string;
	readonly paths: readonly string[];
}
