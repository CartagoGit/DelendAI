/** One check run on a commit, as the forge lists it. */
export interface ISectionCheckRun {
	readonly name: string;
	readonly status?: string | null;
	readonly conclusion: string | null;
}
