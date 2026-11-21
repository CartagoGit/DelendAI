/** What a server runs: a release tag, or a branch at a commit and where it stands against origin. */
export interface IRuntimeState {
	readonly kind: 'tag' | 'branch';
	readonly tag?: string;
	readonly branch?: string;
	readonly sha12?: string;
	readonly ahead: number;
	readonly behind: number;
	readonly dirty: boolean;
	/** A loud note from the follow-origin step, when it did not simply succeed. */
	readonly follow?: string;
}
