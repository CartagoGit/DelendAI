export type IGitAnswers = Readonly<
	Record<string, string | ((args: readonly string[]) => string)>
>;

export interface IInMemoryGit {
	/** `git(cwd, ...args)`: answers by the arguments joined with spaces. */
	readonly run: (cwd: string, ...args: string[]) => string;
	/** Every call so far, as `args.join(' ')`. */
	readonly calls: string[];
}
