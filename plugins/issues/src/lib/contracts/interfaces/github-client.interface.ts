/** Async argv-first process seam used by the GitHub client. */
export type ISpawn = (cmd: readonly string[]) => Promise<{
	readonly exitCode: number;
	readonly stdout: Uint8Array;
	readonly stderr: Uint8Array;
}>;
