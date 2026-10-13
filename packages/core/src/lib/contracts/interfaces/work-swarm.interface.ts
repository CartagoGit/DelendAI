/** One unit of work the swarm can see, read from its ref. */
export interface ISwarmUnit {
	/** Logical ref name, without `refs/heads/` or a remote prefix. */
	readonly ref: string;
	/** The identity that owns it, from the ref's own name. */
	readonly agent: string;
	/** What the rest of the name says it is about. */
	readonly subject: string;
	readonly tip: string;
	/** Commits it has that the integration branch does not. */
	readonly ahead: number;
	/** Commits the integration branch has that it does not. */
	readonly behind: number;
	/**
	 * Authored paths it changed since it branched. Derived files — marked
	 * `linguist-generated` or `merge=delendai-generated` in
	 * `.gitattributes` — are left out: every unit regenerates them, so
	 * two units touching one says nothing about their work.
	 */
	readonly paths: readonly string[];
}

/**
 * Something about two or more units of work that one of them has to act
 * on before both can land cheaply.
 *
 * - `stacked`   — they share commits the integration branch does not
 *                 have: one was built on the other, so the base lands
 *                 first and the other is refreshed after it.
 * - `duplicate` — one proposal slice is live under two generations or two
 *                 agents; one of them is redundant.
 * - `landed`    — a publication whose every commit is already in the
 *                 integration branch; its ref is litter.
 * - `overlap`   — independent units changing most of the same files;
 *                 running them at once buys conflicts, not speed.
 */
export interface ISwarmRelation {
	readonly kind: 'stacked' | 'duplicate' | 'landed' | 'overlap' | 'behind';
	readonly refs: readonly string[];
	readonly detail: string;
}

/** A path more than one unit of work is changing. */
export interface ISwarmOverlap {
	readonly path: string;
	readonly refs: readonly string[];
}

/** What every agent is working on, as git can prove it. */
export interface ISwarmView {
	readonly integration: string;
	readonly units: readonly ISwarmUnit[];
	readonly overlaps: readonly ISwarmOverlap[];
	/** Publication refs currently on a remote. */
	readonly publications: readonly string[];
	/** The same publications, read as units of work. */
	readonly published: readonly ISwarmUnit[];
	readonly relations: readonly ISwarmRelation[];
}
