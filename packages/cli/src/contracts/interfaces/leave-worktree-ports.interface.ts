/** What leaving a worktree needs from the machine; injected in specs. */
export interface ILeaveWorktreePorts {
	/** The checkout's top level and the repository's common git dir, or undefined outside git. */
	readonly locate: (
		cwd: string,
	) => { readonly top: string; readonly commonDir: string } | undefined;
	readonly chdir: (path: string) => void;
}
