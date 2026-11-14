/** The remote a pass reads and pushes to. */
export const LAND_REMOTE = 'origin';

/** The subject of the commit a batch gains when regeneration moved a file. */
export const BATCH_REGENERATION_SUBJECT =
	'chore(generated): recompute on the merge train';

/** The subject of the commit a batch gains when the project's normalization changed it. */
export const BATCH_NORMALIZATION_SUBJECT =
	'chore(generated): normalize the batch';

/** The throwaway ref a trial merge is built under; never pushed. */
export const LAND_TRIAL_REF = 'land/trial';

/** The most a regeneration may run before it is given up on. */
export const REGENERATION_TIMEOUT_MS = 600_000;

/** The wildcard a project's `jobs` command prints for every zone. */
export const JOBS_ALL = '*';

/** The identity a batch's commits carry. */
export const BATCH_COMMIT_IDENTITY = [
	'-c',
	'user.name=merge-train',
	'-c',
	'user.email=merge-train@invalid',
	'-c',
	'core.hooksPath=/dev/null',
] as const;

/** `-c core.hooksPath` pointing at no directory: git finds no hook of any hook manager. */
export const LAND_NO_HOOKS_ARGS: readonly string[] = [
	'-c',
	'core.hooksPath=/dev/null',
];
