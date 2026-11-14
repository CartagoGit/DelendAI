export type IGitAnswers = Readonly<
	Record<string, string | ((args: readonly string[]) => string)>
>;

export interface IInMemoryGit {
	/** `git(cwd, ...args)`: answers by the arguments joined with spaces. */
	readonly run: (cwd: string, ...args: string[]) => string;
	/** Every call so far, as `args.join(' ')`. */
	readonly calls: string[];
}

/** The read cache a git reading service accepts, as a spec supplies it. */
export interface IGitReadCacheShape {
	readonly recall: (spawn: {
		readonly cwd: string;
		readonly args: readonly string[];
	}) => { readonly output: string | undefined } | undefined;
	readonly remember: (
		spawn: { readonly cwd: string; readonly args: readonly string[] },
		output: string | undefined,
	) => void;
	readonly ran: (spawn: {
		readonly cwd: string;
		readonly args: readonly string[];
	}) => void;
	readonly forgetUnit: (unit: string) => void;
}
