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
	/**
	 * The kind of work (f00644): named by the ref, or derived for a ref
	 * written before the shape carried one.
	 */
	readonly kind: string;
	readonly proposal: string;
	readonly slice: string;
	readonly generation: number;
	/** The descriptive slug, when the template carries `${topic}`. */
	readonly topic?: string;
}

/** A compiled parser for one template. */
export interface IWorkRefParser {
	/** The namespace refs live under, e.g. `refs/wip`. */
	readonly namespace: string;
	readonly parse: (refName: string) => IWorkRefIdentity | undefined;
}
