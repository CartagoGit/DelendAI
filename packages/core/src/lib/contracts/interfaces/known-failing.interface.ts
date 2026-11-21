/** What the repair pass writes: the note of `commit` on `ref`. */
export interface IKnownFailingNote {
	readonly ref: string;
	readonly commit: string;
	readonly content: string;
}

/** Runs git; `undefined` when it exits non-zero. */
export type IKnownFailingGit = (args: readonly string[]) => string | undefined;
