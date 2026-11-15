import type { IRehearsalFileChange } from './rehearsal.interface';

/**
 * Runs the policy's setup command over `files` in a worktree of the base
 * commit and returns every file the command changed; it throws, naming the
 * command, when the command fails.
 */
export type IRehearsalSetupMaterialiser = (
	command: string,
	files: readonly IRehearsalFileChange[],
) => Promise<readonly IRehearsalFileChange[]>;
