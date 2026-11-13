/** A work namespace delendai owns: its prefix and the template under it. */
export interface IOwnedWorkRefShape {
	readonly prefix: string;
	readonly template: string;
	/** True for the namespace new work is written under. */
	readonly current: boolean;
}
