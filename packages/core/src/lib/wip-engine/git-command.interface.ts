/**
 * Contract shapes for `./git-command`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `git-command.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `git-command.ts`, so no import site changes.
 */

import type { IGitRunResult } from '../contracts/interfaces/git-runner.interface';

/** Extra environment applied to a single git invocation. */
export type IGitEnvironment = Readonly<Record<string, string>>;

/**
 * A runner that also accepts per-invocation environment. Deliberately a
 * superset of `IGitRunner` (the env argument is optional) so a scoped
 * runner can be passed anywhere the shared contract is expected.
 */
export type IScopedGitRunner = (
	args: readonly string[],
	env?: IGitEnvironment,
) => Promise<IGitRunResult>;
