/**
 * Contract shapes for `./work-ref-identity`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `work-ref-identity.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `work-ref-identity.ts`, so no import site changes.
 */

/** The identity a work ref encodes. */
export interface IWorkRefIdentity {
	readonly agent: string;
	readonly proposal: string;
	readonly slice: string;
	readonly generation: number;
}

/** A compiled parser for one template. */
export interface IWorkRefParser {
	/** The namespace refs live under, e.g. `refs/wip`. */
	readonly namespace: string;
	readonly parse: (refName: string) => IWorkRefIdentity | undefined;
}
