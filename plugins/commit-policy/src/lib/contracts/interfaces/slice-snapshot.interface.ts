/** One slice as the listener sees it: what it is, and what it touches. */
export interface ISliceSnapshotEntry {
	readonly status: string;
	readonly proposalId: string;
	readonly files?: readonly string[];
}

/** The slices of every proposal, read from the documents themselves. */
export interface ISliceSnapshotReader {
	/**
	 * Every slice keyed `<proposal>-<slice>`, or `undefined` when the
	 * proposals folder cannot be listed (nothing to compare against).
	 */
	read(): Promise<Map<string, ISliceSnapshotEntry> | undefined>;
}
