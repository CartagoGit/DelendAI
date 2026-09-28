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
	/** Paths it changed since it branched. */
	readonly paths: readonly string[];
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
}
