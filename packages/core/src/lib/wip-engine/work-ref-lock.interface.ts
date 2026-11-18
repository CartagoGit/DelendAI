/**
 * Contract shapes for `./work-ref-lock`.
 *
 * Split out of the implementation module so the repo's "types live in
 * contracts" convention holds. Re-exported from `work-ref-lock.ts`, so no
 * import site changes.
 */

export interface IWorkRefLockOptions {
	/**
	 * The repository's git common directory, absolute. Shared by every
	 * worktree of the clone, so a lock taken from one is seen from all.
	 */
	readonly gitCommonDir: string;
	/** The work ref, as the caller names it (qualified or short). */
	readonly ref: string;
	readonly machineId?: string | undefined;
	readonly now?: (() => number) | undefined;
	readonly pid?: number | undefined;
	readonly ttlMs?: number | undefined;
}

export type IWorkRefLockOutcome =
	| { readonly kind: 'acquired'; readonly release: () => Promise<void> }
	| { readonly kind: 'busy'; readonly holder: string };
