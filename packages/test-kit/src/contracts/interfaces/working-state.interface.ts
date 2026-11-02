/** One path that differed from HEAD, as it was found. */
export interface IWorkingPathState {
	readonly path: string;
	/** The file's bytes, or `null` when it does not exist on disk. */
	readonly content: Buffer | null;
	/** `<mode> <object>` from the index, or `null` when not in the index. */
	readonly indexEntry: string | null;
}

/** Every path of a working tree that differed from HEAD, and nothing else. */
export interface IWorkingState {
	readonly root: string;
	readonly paths: readonly IWorkingPathState[];
}
