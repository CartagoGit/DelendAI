/**
 * authority.interface.ts — which copy of a fact is the truth.
 *
 * Most defects fixed in late September 2026 were one fact kept in two
 * places that disagreed: the work-ref shape, the plugin defaults, the
 * bundled skills, the proposal status. Each fix made one copy the
 * authority and derived the others, and none of them wrote that decision
 * anywhere a later change could check.
 *
 * A declaration states it once, next to the code that owns the fact: the
 * authority, every projection with the producer that writes it, and —
 * when they exist — what reconciles, fingerprints, rebuilds and guards
 * them. It knows nothing about proposals or branches; a plugin declares
 * its own facts in its manifest, including the ones it keeps in a
 * consumer's repository.
 */

/** One copy of the fact that is derived, never edited as the truth. */
export interface IAuthorityProjection {
	/** Repo-relative path of the copy. */
	readonly path: string;
	/** What writes it: a script path, a command, or a module. */
	readonly producer: string;
}

export interface IAuthorityDeclaration {
	/** Kebab-case name of the fact, unique among declarations. */
	readonly domain: string;
	/**
	 * Where the truth is kept: a repo-relative path, or a named store
	 * such as `sqlite:proposals`.
	 */
	readonly authority: string;
	/** The derived copies. A fact with one copy needs no declaration. */
	readonly projections: readonly IAuthorityProjection[];
	/** What brings the projections back in line with the authority. */
	readonly reconciler?: string | undefined;
	/** How a drift is detected without a full comparison. */
	readonly digest?: string | undefined;
	/** The command that regenerates every projection. */
	readonly rebuild?: string | undefined;
	/** The `package.json` script that fails when a projection drifts. */
	readonly driftGate?: string | undefined;
}
