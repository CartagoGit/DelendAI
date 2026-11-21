/**
 * swarm-roster.interface.ts — who took part in a run, and what each left.
 */

/** One agent of a run, with what it holds and what it produced. */
export interface ISwarmAgent {
	readonly agent: string;
	/** The sessions of this agent that entered a unit: its instances. */
	readonly instances: number;
	/** Units it holds now, by any name. */
	readonly units: number;
	/** Commits its units and publications hold over the integration branch. */
	readonly commits: number;
	/** Publications of its work waiting to land. */
	readonly published: number;
	/** True when it entered a unit and committed nothing. */
	readonly producedNothing: boolean;
}
