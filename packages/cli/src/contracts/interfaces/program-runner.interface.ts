/** Runs a program in `cwd` and answers its stdout; a refusal throws with what the program printed. */
export type IProgramRunner = (
	program: string,
	args: readonly string[],
	cwd: string,
) => Promise<string>;
